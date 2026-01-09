/**
 * Deploy Worker
 * Processes deploy jobs by running kosuke-cli in an ephemeral container
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { deployJobs } from '@/lib/db/schema';
import { getSandboxManager } from '@/lib/sandbox';

import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { DeployJobData, DeployJobResult } from '../queues/deploy';

/**
 * Process a deploy job by running kosuke-cli in a command sandbox
 */
async function processDeployJob(job: { data: DeployJobData }): Promise<DeployJobResult> {
  const { deployJobId, projectId, repoUrl, branch, githubToken, orgId } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[DEPLOY] 🚀 Starting deploy job ${deployJobId}`);
  console.log(`[DEPLOY] 📁 Project: ${projectId}`);
  console.log('='.repeat(80) + '\n');

  // Update deploy job status to running
  await db
    .update(deployJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      currentStep: 'Starting container',
    })
    .where(eq(deployJobs.id, deployJobId));

  try {
    // Run kosuke deploy command using createSandbox with command mode
    // All env vars (Anthropic, Render, Langfuse, Git identity) are handled by SandboxManager
    const manager = getSandboxManager();

    console.log(`[DEPLOY] 📦 Running command: kosuke deploy`);

    const result = await manager.createSandbox({
      projectId,
      sessionId: deployJobId, // Use job ID as session ID for predictable container naming
      branchName: branch,
      repoUrl,
      githubToken,
      mode: 'development',
      servicesMode: 'command',
      orgId,
      command: ['kosuke', 'deploy'],
      commandTimeout: 30 * 60 * 1000, // 30 minutes
    });

    const exitCode = result.exitCode ?? -1;

    // Update job status based on exit code
    const success = exitCode === 0;
    const status = success ? 'completed' : 'failed';

    await db
      .update(deployJobs)
      .set({
        status,
        completedAt: new Date(),
        currentStep: success ? 'Completed' : 'Failed',
        error: success ? null : `Command exited with code ${exitCode}`,
      })
      .where(eq(deployJobs.id, deployJobId));

    console.log('\n' + '='.repeat(80));
    console.log(`[DEPLOY] ${success ? '✅' : '❌'} Deploy job ${deployJobId} ${status}`);
    console.log(`[DEPLOY] Exit code: ${exitCode}`);
    console.log('='.repeat(80) + '\n');

    return {
      success,
      exitCode,
      error: success ? undefined : `Command exited with code ${exitCode}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('\n' + '='.repeat(80));
    console.error(`[DEPLOY] ❌ Deploy job ${deployJobId} failed`);
    console.error(`[DEPLOY] Error: ${errorMessage}`);
    console.error('='.repeat(80) + '\n');

    // Update deploy job to failed
    await db
      .update(deployJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        currentStep: 'Failed',
        error: errorMessage,
      })
      .where(eq(deployJobs.id, deployJobId));

    throw error;
  }
}

/**
 * Create and initialize deploy worker
 * Factory function - NO side effects until called
 */
export function createDeployWorker() {
  const worker = createWorker<DeployJobData>(QUEUE_NAMES.DEPLOY, processDeployJob, {
    concurrency: 1, // One deploy job at a time per worker
  });

  const events = createQueueEvents(QUEUE_NAMES.DEPLOY);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Deploy job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as DeployJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Exit code: ${result.exitCode}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Deploy job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Deploy Worker Initialized (Command Mode)');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.DEPLOY);
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process deploy jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}

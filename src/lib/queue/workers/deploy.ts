/**
 * Deploy Worker
 * Processes deploy jobs by running kosuke-cli in an ephemeral container
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { deployJobs } from '@/lib/db/schema';
import { KOSUKE_BOT_EMAIL, KOSUKE_BOT_NAME } from '@/lib/github/installations';
import { getSandboxManager } from '@/lib/sandbox';

import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { DeployJobData, DeployJobResult } from '../queues/deploy';

/**
 * Build environment variables for deploy command container
 */
function buildEnvVars(data: DeployJobData): Record<string, string> {
  const { env } = data;

  return {
    // Repository info
    KOSUKE_REPO_URL: env.repoUrl,
    KOSUKE_BRANCH: env.branch,
    KOSUKE_GITHUB_TOKEN: env.githubToken,

    // Organization
    ...(env.orgId && { KOSUKE_ORG_ID: env.orgId }),

    // AI credentials (may be needed for deploy)
    ANTHROPIC_API_KEY: env.anthropicApiKey,

    // Render deployment credentials
    RENDER_API_KEY: env.renderApiKey,
    RENDER_OWNER_ID: env.renderOwnerId,

    // Langfuse tracing
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || '',
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || '',
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL || '',

    // Git identity
    KOSUKE_GIT_NAME: KOSUKE_BOT_NAME,
    KOSUKE_GIT_EMAIL: KOSUKE_BOT_EMAIL,
  };
}

/**
 * Process a deploy job by running kosuke-cli in a command sandbox
 */
async function processDeployJob(job: { data: DeployJobData }): Promise<DeployJobResult> {
  const { deployJobId, projectId, env } = job.data;

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
    const manager = getSandboxManager();
    const commandEnv = buildEnvVars(job.data);

    console.log(`[DEPLOY] 📦 Running command: kosuke deploy`);

    const result = await manager.createSandbox({
      projectId,
      sessionId: deployJobId, // Use job ID as session ID for predictable container naming
      branchName: env.branch,
      repoUrl: env.repoUrl,
      githubToken: env.githubToken,
      mode: 'development',
      servicesMode: 'command',
      orgId: env.orgId,
      command: ['kosuke', 'deploy'],
      commandEnv,
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

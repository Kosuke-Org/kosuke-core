/**
 * Vamos Worker
 * Processes vamos jobs by running kosuke-cli in an ephemeral container
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { vamosJobs } from '@/lib/db/schema';
import { KOSUKE_BOT_EMAIL, KOSUKE_BOT_NAME } from '@/lib/github/installations';
import { getSandboxManager } from '@/lib/sandbox';

import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { VamosJobData, VamosJobResult } from '../queues/vamos';

/**
 * Build environment variables for vamos command container
 */
function buildEnvVars(data: VamosJobData): Record<string, string> {
  const { env, withTests, isolated } = data;

  return {
    // Repository info
    KOSUKE_REPO_URL: env.repoUrl,
    KOSUKE_BRANCH: env.branch,
    KOSUKE_GITHUB_TOKEN: env.githubToken,

    // Database
    KOSUKE_POSTGRES_URL: env.dbUrl,

    // Organization
    ...(env.orgId && { KOSUKE_ORG_ID: env.orgId }),

    // AI credentials
    ANTHROPIC_API_KEY: env.anthropicApiKey,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
    GOOGLE_MODEL: process.env.GOOGLE_MODEL || '',
    AGENT_MAX_TURNS: process.env.AGENT_MAX_TURNS || '25',

    // Langfuse tracing
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || '',
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || '',
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL || '',

    // Git identity
    KOSUKE_GIT_NAME: KOSUKE_BOT_NAME,
    KOSUKE_GIT_EMAIL: KOSUKE_BOT_EMAIL,

    // Vamos options as env vars for CLI
    VAMOS_WITH_TESTS: withTests ? 'true' : 'false',
    VAMOS_ISOLATED: isolated ? 'true' : 'false',
  };
}

/**
 * Process a vamos job by running kosuke-cli in a command sandbox
 */
async function processVamosJob(job: { data: VamosJobData }): Promise<VamosJobResult> {
  const { vamosJobId, projectId, withTests, isolated, env } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[VAMOS] 🚀 Starting vamos job ${vamosJobId}`);
  console.log(`[VAMOS] 📁 Project: ${projectId}`);
  console.log(`[VAMOS] 🧪 With Tests: ${withTests}`);
  console.log(`[VAMOS] 🔒 Isolated: ${isolated}`);
  console.log('='.repeat(80) + '\n');

  // Update vamos job status to running
  await db
    .update(vamosJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      phase: 'Starting container',
    })
    .where(eq(vamosJobs.id, vamosJobId));

  try {
    // Run kosuke vamos command using createSandbox with command mode
    const manager = getSandboxManager();
    const commandEnv = buildEnvVars(job.data);

    console.log(`[VAMOS] 📦 Running command: kosuke vamos`);

    const result = await manager.createSandbox({
      projectId,
      sessionId: vamosJobId, // Use job ID as session ID for predictable container naming
      branchName: env.branch,
      repoUrl: env.repoUrl,
      githubToken: env.githubToken,
      mode: 'development',
      servicesMode: 'command',
      orgId: env.orgId,
      command: ['kosuke', 'vamos'],
      commandEnv,
      commandTimeout: 60 * 60 * 1000, // 1 hour
    });

    const exitCode = result.exitCode ?? -1;

    // Update job status based on exit code
    const success = exitCode === 0;
    const status = success ? 'completed' : 'failed';

    await db
      .update(vamosJobs)
      .set({
        status,
        completedAt: new Date(),
        phase: success ? 'Completed' : 'Failed',
        error: success ? null : `Command exited with code ${exitCode}`,
      })
      .where(eq(vamosJobs.id, vamosJobId));

    console.log('\n' + '='.repeat(80));
    console.log(`[VAMOS] ${success ? '✅' : '❌'} Vamos job ${vamosJobId} ${status}`);
    console.log(`[VAMOS] Exit code: ${exitCode}`);
    console.log('='.repeat(80) + '\n');

    return {
      success,
      exitCode,
      error: success ? undefined : `Command exited with code ${exitCode}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('\n' + '='.repeat(80));
    console.error(`[VAMOS] ❌ Vamos job ${vamosJobId} failed`);
    console.error(`[VAMOS] Error: ${errorMessage}`);
    console.error('='.repeat(80) + '\n');

    // Update vamos job to failed
    await db
      .update(vamosJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        phase: 'Failed',
        error: errorMessage,
      })
      .where(eq(vamosJobs.id, vamosJobId));

    throw error;
  }
}

/**
 * Create and initialize vamos worker
 * Factory function - NO side effects until called
 */
export function createVamosWorker() {
  const worker = createWorker<VamosJobData>(QUEUE_NAMES.VAMOS, processVamosJob, {
    concurrency: 1, // One vamos job at a time per worker
  });

  const events = createQueueEvents(QUEUE_NAMES.VAMOS);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Vamos job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as VamosJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Exit code: ${result.exitCode}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Vamos job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Vamos Worker Initialized (Command Mode)');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.VAMOS);
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process vamos jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}

/**
 * Environment Worker
 * Processes environment analysis jobs from BullMQ queue
 * Calls kosuke-cli environment command via HTTP
 */

import { db } from '@/lib/db/drizzle';
import { environmentJobs } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { EnvironmentJobData, EnvironmentJobResult } from '../queues/environment';

/**
 * Process an environment analysis job by calling kosuke-cli environment command
 */
async function processEnvironmentJob(job: {
  data: EnvironmentJobData;
}): Promise<EnvironmentJobResult> {
  const { environmentJobId, projectId, sessionId, cwd = '/app/project' } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[ENVIRONMENT] 🚀 Starting environment analysis job ${environmentJobId}`);
  console.log(`[ENVIRONMENT] 📁 Project: ${projectId}`);
  console.log(`[ENVIRONMENT] 🔗 Session: ${sessionId}`);
  console.log('='.repeat(80) + '\n');

  // Update environment job status to running
  await db
    .update(environmentJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(environmentJobs.id, environmentJobId));

  const sandboxClient = new SandboxClient(sessionId);

  try {
    console.log(`[ENVIRONMENT] 🔗 Connecting to sandbox environment API...`);

    // Stream environment analysis events
    let variableCount = 0;

    for await (const event of sandboxClient.streamEnvironment(cwd)) {
      // Log events for visibility
      if (event.type === 'message') {
        const data = event.data as { text?: string };
        if (data.text) {
          const text = data.text.substring(0, 150);
          console.log(`[ENVIRONMENT] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
        }
      } else if (event.type === 'tool_call') {
        const data = event.data as { action?: string };
        console.log(`[ENVIRONMENT] 🔧 Tool: ${data.action || 'unknown'}`);
      } else if (event.type === 'done') {
        const data = event.data as { variableCount?: number };
        variableCount = data.variableCount || 0;
        console.log(`[ENVIRONMENT] ✅ Analysis complete: ${variableCount} variables found`);
      } else if (event.type === 'error') {
        const data = event.data as { message?: string };
        throw new Error(data.message || 'Environment analysis failed');
      }
    }

    // Update environment job to completed
    await db
      .update(environmentJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        variableCount,
      })
      .where(eq(environmentJobs.id, environmentJobId));

    console.log('\n' + '='.repeat(80));
    console.log(`[ENVIRONMENT] ✅ Environment job ${environmentJobId} completed successfully`);
    console.log(`[ENVIRONMENT] 📊 Variables found: ${variableCount}`);
    console.log('='.repeat(80) + '\n');

    return {
      success: true,
      variableCount,
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(`[ENVIRONMENT] ❌ Environment job ${environmentJobId} failed`);
    console.error(`[ENVIRONMENT] Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(80) + '\n');

    // Update environment job to failed
    await db
      .update(environmentJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(environmentJobs.id, environmentJobId));

    // Re-throw so BullMQ treats this as a failed job
    throw error;
  }
}

/**
 * Create and initialize environment worker
 * Factory function - NO side effects until called
 */
export function createEnvironmentWorker() {
  const worker = createWorker<EnvironmentJobData>(QUEUE_NAMES.ENVIRONMENT, processEnvironmentJob, {
    concurrency: 2, // Can run multiple environment analyses in parallel
  });

  const events = createQueueEvents(QUEUE_NAMES.ENVIRONMENT);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Environment job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as EnvironmentJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Variables: ${result.variableCount}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Environment job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Environment Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.ENVIRONMENT);
  console.log('[WORKER]    Concurrency: 2');
  console.log('[WORKER]    Ready to process environment analysis jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}

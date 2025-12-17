/**
 * BullMQ Queue Module
 */

export { createQueue, createQueueEvents, gracefulShutdown } from './client';
export { JOB_NAMES, QUEUE_NAMES } from './config';
export { buildQueue, type BuildJobData, type BuildJobResult } from './queues/build';
export { previewQueue, schedulePreviewCleanup } from './queues/previews';
export { createBuildWorker } from './workers/build';
export { createPreviewWorker } from './workers/previews';

export async function scheduleAllJobs() {
  const { schedulePreviewCleanup } = await import('./queues/previews');
  await schedulePreviewCleanup();
}

// ============================================================
// Build Queue Helpers
// ============================================================

/**
 * Enqueue a build job
 */
export async function enqueueBuild(data: import('./queues/build').BuildJobData): Promise<void> {
  const { buildQueue } = await import('./queues/build');
  const { JOB_NAMES } = await import('./config');

  await buildQueue.add(JOB_NAMES.PROCESS_BUILD, data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });

  console.log(`[BUILD] ✅ Enqueued build job ${data.buildJobId}`);
}

/**
 * Check if there's an active build for a session
 */
export async function hasActiveBuild(chatSessionId: string): Promise<boolean> {
  const { buildQueue } = await import('./queues/build');

  const activeJobs = await buildQueue.getActive();
  const waitingJobs = await buildQueue.getWaiting();

  return [...activeJobs, ...waitingJobs].some(job => job.data.chatSessionId === chatSessionId);
}

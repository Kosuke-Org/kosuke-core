/**
 * BullMQ Queue Module
 * Re-exports all queue, worker, and utility exports for convenience
 */

export { createQueue, createQueueEvents, createWorker, gracefulShutdown } from './client';
export { JOB_NAMES, QUEUE_NAMES } from './config';
export {
  buildQueue,
  enqueueBuild,
  hasActiveBuild,
  type BuildJobData,
  type BuildJobResult,
} from './queues/build';
export { previewQueue, schedulePreviewCleanup } from './queues/previews';
export { buildWorker } from './workers/build';
export { previewWorker } from './workers/previews';

export async function scheduleAllJobs() {
  const { schedulePreviewCleanup } = await import('./queues/previews');
  await schedulePreviewCleanup();
}

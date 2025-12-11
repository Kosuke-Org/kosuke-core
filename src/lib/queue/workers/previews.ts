import { cleanupInactiveSessions } from '@/lib/sandbox/cleanup';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { PreviewCleanupJobData } from '../queues/previews';

/**
 * Preview cleanup worker
 * Thin wrapper - only handles worker lifecycle and events
 * Business logic is in cleanupInactiveSessions
 */
export const previewWorker = createWorker<PreviewCleanupJobData>(
  QUEUE_NAMES.PREVIEW_CLEANUP,
  async job => {
    const thresholdMinutes = job.data.thresholdMinutes;
    return await cleanupInactiveSessions(thresholdMinutes);
  },
  {
    concurrency: parseInt(process.env.CLEANUP_WORKER_CONCURRENCY || '1', 10),
  }
);

/**
 * Queue events for monitoring
 */
const previewEvents = createQueueEvents(QUEUE_NAMES.PREVIEW_CLEANUP);

previewEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`[PREVIEW] ✅ Job ${jobId} completed:`, returnvalue);
});

previewEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[PREVIEW] ❌ Job ${jobId} failed:`, failedReason);
});

previewEvents.on('progress', ({ jobId, data }) => {
  console.log(`[PREVIEW] 📊 Job ${jobId} progress:`, data);
});

console.log('[PREVIEW] 🚀 Worker initialized');

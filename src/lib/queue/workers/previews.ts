/**
 * Preview Cleanup Worker
 * Handles scheduled cleanup of inactive preview environments
 */

import { cleanupInactiveSessions } from '@/lib/sandbox/cleanup';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { PreviewCleanupJobData } from '../queues/previews';

/**
 * Create and initialize preview cleanup worker
 * Factory function - NO side effects until called
 */
export function createPreviewWorker() {
  const worker = createWorker<PreviewCleanupJobData>(
    QUEUE_NAMES.PREVIEW_CLEANUP,
    async job => {
      const thresholdMinutes = job.data.thresholdMinutes;
      return await cleanupInactiveSessions(thresholdMinutes);
    },
    {
      concurrency: parseInt(process.env.CLEANUP_WORKER_CONCURRENCY || '1', 10),
    }
  );

  const events = createQueueEvents(QUEUE_NAMES.PREVIEW_CLEANUP);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log(`[PREVIEW] ✅ Job ${jobId} completed:`, returnvalue);
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error(`[PREVIEW] ❌ Job ${jobId} failed:`, failedReason);
  });

  events.on('progress', ({ jobId, data }) => {
    console.log(`[PREVIEW] 📊 Job ${jobId} progress:`, data);
  });

  console.log('[PREVIEW] 🚀 Worker initialized');

  return worker;
}

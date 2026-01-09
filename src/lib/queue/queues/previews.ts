import type { Queue } from 'bullmq';
import { createQueue } from '../client';
import { JOB_NAMES, QUEUE_NAMES } from '../config';

/**
 * Type-safe preview cleanup job data
 */
export interface PreviewCleanupJobData {
  thresholdMinutes: number;
}

/**
 * Lazy-initialized preview cleanup queue instance
 * Only connects to Redis when first accessed, not on module import
 */
let _previewQueue: Queue<PreviewCleanupJobData> | null = null;

export function getPreviewQueue(): Queue<PreviewCleanupJobData> {
  if (_previewQueue) {
    return _previewQueue;
  }
  _previewQueue = createQueue<PreviewCleanupJobData>(QUEUE_NAMES.PREVIEW_CLEANUP);
  return _previewQueue;
}

/**
 * Schedule the recurring cleanup job
 * Safe to call multiple times (uses upsertJobScheduler)
 */
export async function schedulePreviewCleanup() {
  const thresholdMinutes = parseInt(process.env.CLEANUP_THRESHOLD_MINUTES!, 10);
  const intervalMinutes = parseInt(process.env.CLEANUP_INTERVAL_MINUTES!, 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  await getPreviewQueue().upsertJobScheduler(
    JOB_NAMES.CLEANUP_INACTIVE_PREVIEWS,
    {
      every: intervalMs,
    },
    {
      data: { thresholdMinutes },
    }
  );

  console.log(
    `[PREVIEW] 📅 Scheduled cleanup to run every ${intervalMs}ms (threshold: ${thresholdMinutes}min)`
  );
}

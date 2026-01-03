/**
 * BullMQ Queue Constants
 *
 * Centralized queue and job names for type safety and consistency.
 * Import these constants instead of using string literals to prevent typos.
 */

/**
 * Queue names - one queue per domain/feature
 */
export const QUEUE_NAMES = {
  PREVIEW_CLEANUP: 'preview-cleanup',
  BUILD: 'build',
} as const;

/**
 * Job names - organized by queue
 */
export const JOB_NAMES = {
  CLEANUP_INACTIVE_PREVIEWS: 'cleanup-inactive-previews',
  PROCESS_BUILD: 'process-build',
} as const;

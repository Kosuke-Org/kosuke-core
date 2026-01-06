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
  SUBMIT: 'submit',
  MAINTENANCE: 'maintenance',
} as const;

/**
 * Job names - organized by queue
 */
export const JOB_NAMES = {
  // Preview cleanup jobs
  CLEANUP_INACTIVE_PREVIEWS: 'cleanup-inactive-previews',
  // Build jobs
  PROCESS_BUILD: 'process-build',
  // Submit jobs
  PROCESS_SUBMIT: 'process-submit',
  // Maintenance jobs
  MAINTENANCE_SYNC_RULES: 'maintenance-sync-rules',
  MAINTENANCE_ANALYZE: 'maintenance-analyze',
  MAINTENANCE_SECURITY_CHECK: 'maintenance-security-check',
} as const;

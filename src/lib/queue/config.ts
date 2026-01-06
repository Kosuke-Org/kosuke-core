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
  ENVIRONMENT: 'environment',
  VAMOS: 'vamos',
  DEPLOY: 'deploy',
  SUBMIT: 'submit',
} as const;

/**
 * Job names - organized by queue
 */
export const JOB_NAMES = {
  // Preview cleanup jobs
  CLEANUP_INACTIVE_PREVIEWS: 'cleanup-inactive-previews',
  // Build jobs
  PROCESS_BUILD: 'process-build',
  // Environment jobs
  ANALYZE_ENVIRONMENT: 'analyze-environment',
  // Vamos jobs
  PROCESS_VAMOS: 'process-vamos',
  // Deploy jobs
  PROCESS_DEPLOY: 'process-deploy',
  // Submit jobs
  PROCESS_SUBMIT: 'process-submit',
} as const;

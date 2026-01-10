/**
 * Job Types for Admin Jobs Monitoring
 *
 * Types for BullMQ queue monitoring in the admin panel.
 */

/**
 * Possible job statuses in BullMQ
 */
export type JobStatus = 'completed' | 'failed' | 'active' | 'waiting' | 'delayed';

/**
 * Job counts by status for a queue
 */
interface JobCounts {
  completed: number;
  failed: number;
  active: number;
  waiting: number;
  delayed: number;
}

/**
 * Scheduler/cron job configuration
 */
interface JobScheduler {
  id: string;
  name: string;
  pattern?: string;
  every?: number;
  nextRun: number | null;
}

/**
 * Scheduler with queue info for cron page
 */
export interface SchedulerWithQueue extends JobScheduler {
  queueName: string;
  lastRun?: number | null;
}

/**
 * List schedulers API response
 */
export interface ListSchedulersResponse {
  schedulers: SchedulerWithQueue[];
}

/**
 * Detailed job information
 */
interface JobDetails {
  id: string;
  name: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: unknown;
}

/**
 * Job details with queue information
 */
export interface JobDetailsWithQueue extends JobDetails {
  queueName: string;
}

/**
 * All jobs response (from all queues)
 */
export interface AllJobsResponse {
  jobs: JobDetailsWithQueue[];
  counts: JobCounts;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

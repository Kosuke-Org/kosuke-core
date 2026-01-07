import type { MaintenanceJobType } from '@/lib/db/schema';
import { createQueue } from '../client';
import { JOB_NAMES, QUEUE_NAMES } from '../config';

/**
 * Type-safe maintenance job data
 */
export interface MaintenanceJobData {
  maintenanceJobId: string; // maintenance_jobs.id
  projectId: string;
  jobType: MaintenanceJobType;
}

/**
 * Maintenance job result
 */
export interface MaintenanceJobResult {
  success: boolean;
  runId: string;
  pullRequestUrl?: string;
  summary?: string;
  error?: string;
}

/**
 * CLI maintenance endpoint response
 * Returned from /api/maintenance SSE stream's 'done' event
 */
export interface MaintenanceCliResult {
  success: boolean;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  summary?: string;
  error?: string;
}

/**
 * Maintenance queue instance
 */
export const maintenanceQueue = createQueue<MaintenanceJobData>(QUEUE_NAMES.MAINTENANCE);

/**
 * Get cron pattern for job type
 * - SYNC_RULES: Every 7 days at 2 AM UTC
 * - ANALYZE: Every 14 days at 2 AM UTC
 * - SECURITY_CHECK: Every 3 days at 2 AM UTC
 */
function getJobFrequency(jobType: MaintenanceJobType): string {
  switch (jobType) {
    case 'sync_rules':
      return '0 2 */7 * *'; // Every 7 days at 2 AM
    case 'code_analysis':
      return '0 2 */14 * *'; // Every 14 days at 2 AM
    case 'security_check':
      return '0 2 */3 * *'; // Every 3 days at 2 AM
  }
}

/**
 * Get job name for job type
 */
function getJobName(jobType: MaintenanceJobType): string {
  switch (jobType) {
    case 'sync_rules':
      return JOB_NAMES.MAINTENANCE_SYNC_RULES;
    case 'code_analysis':
      return JOB_NAMES.MAINTENANCE_CODE_ANALYSIS;
    case 'security_check':
      return JOB_NAMES.MAINTENANCE_SECURITY_CHECK;
  }
}

/**
 * Schedule all maintenance jobs for enabled projects
 * Called on worker startup and uses BullMQ repeatable jobs
 */
export async function scheduleMaintenanceJobs() {
  const { db } = await import('@/lib/db/drizzle');
  const { maintenanceJobs, projects } = await import('@/lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Get all enabled maintenance jobs for non-archived projects
  const enabledJobs = await db
    .select({
      id: maintenanceJobs.id,
      projectId: maintenanceJobs.projectId,
      jobType: maintenanceJobs.jobType,
    })
    .from(maintenanceJobs)
    .innerJoin(projects, eq(maintenanceJobs.projectId, projects.id))
    .where(and(eq(maintenanceJobs.enabled, true), eq(projects.isArchived, false)));

  console.log(`[MAINTENANCE] 📋 Found ${enabledJobs.length} enabled maintenance jobs`);

  // Schedule each job using BullMQ repeatable jobs
  for (const job of enabledJobs) {
    const jobName = getJobName(job.jobType);
    const repeatKey = `maintenance:${job.id}`;
    const pattern = getJobFrequency(job.jobType);

    await maintenanceQueue.upsertJobScheduler(
      repeatKey,
      {
        pattern,
      },
      {
        name: jobName,
        data: {
          maintenanceJobId: job.id,
          projectId: job.projectId,
          jobType: job.jobType,
        },
      }
    );

    console.log(
      `[MAINTENANCE] 📅 Scheduled ${job.jobType} for project ${job.projectId} (pattern: ${pattern})`
    );
  }
}

/**
 * Schedule a single maintenance job
 * Called when a job is enabled
 */
export async function scheduleMaintenanceJob(
  maintenanceJobId: string,
  projectId: string,
  jobType: MaintenanceJobType
) {
  const jobName = getJobName(jobType);
  const repeatKey = `maintenance:${maintenanceJobId}`;
  const pattern = getJobFrequency(jobType);

  await maintenanceQueue.upsertJobScheduler(
    repeatKey,
    {
      pattern,
    },
    {
      name: jobName,
      data: {
        maintenanceJobId,
        projectId,
        jobType,
      },
    }
  );

  console.log(
    `[MAINTENANCE] 📅 Scheduled ${jobType} for project ${projectId} (pattern: ${pattern})`
  );
}

/**
 * Remove scheduled job when disabled
 */
export async function unscheduleMaintenanceJob(maintenanceJobId: string) {
  const repeatKey = `maintenance:${maintenanceJobId}`;
  await maintenanceQueue.removeJobScheduler(repeatKey);
  console.log(`[MAINTENANCE] 🗑️ Unscheduled maintenance job ${maintenanceJobId}`);
}

/**
 * Get the step value for a job type (from cron pattern *\/N)
 */
function getJobStep(jobType: MaintenanceJobType): number {
  switch (jobType) {
    case 'sync_rules':
      return 7; // */7 - days 1, 8, 15, 22, 29
    case 'code_analysis':
      return 14; // */14 - days 1, 15, 29
    case 'security_check':
      return 3; // */3 - days 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31
  }
}

/**
 * Calculate next run time for a job type
 * Matches cron pattern *\/N behavior for day-of-month field
 */
export function calculateNextRun(jobType: MaintenanceJobType): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0); // 2 AM UTC

  // If it's already past 2 AM today, start checking from tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  const step = getJobStep(jobType);

  // Find next day where (day - 1) % step === 0
  // This matches cron's */step behavior: days 1, 1+step, 1+2*step, etc.
  while ((next.getUTCDate() - 1) % step !== 0) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

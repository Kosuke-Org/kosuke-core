import type { MaintenanceJob, MaintenanceJobRun, MaintenanceJobType } from '@/lib/db/schema';

/**
 * Extended maintenance job with latest run and next run info
 */
export interface MaintenanceJobWithRun {
  id: string | null;
  projectId: string;
  jobType: MaintenanceJobType;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  latestRun: MaintenanceJobRun | null;
  nextRunAt: string | null;
}

/**
 * Response from GET /api/projects/[id]/maintenance-jobs
 */
export interface MaintenanceJobsResponse {
  jobs: MaintenanceJobWithRun[];
}

/**
 * Response from PUT /api/projects/[id]/maintenance-jobs
 */
export interface UpdateMaintenanceJobResponse {
  job: MaintenanceJob;
  nextRunAt: string | null;
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { maintenanceJobRuns, maintenanceJobs } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { calculateNextRun, scheduleMaintenanceJob, unscheduleMaintenanceJob } from '@/lib/queue';
import { desc, eq } from 'drizzle-orm';

// Schema for updating maintenance job
const updateMaintenanceJobSchema = z.object({
  jobType: z.enum(['sync_rules', 'analyze', 'security_check']),
  enabled: z.boolean(),
});

/**
 * GET /api/projects/[id]/maintenance-jobs
 * Get maintenance job configurations and latest run status for a project
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);
    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get all maintenance jobs for this project
    const jobs = await db
      .select()
      .from(maintenanceJobs)
      .where(eq(maintenanceJobs.projectId, projectId));

    // Get latest run for each job
    const jobsWithLatestRun = await Promise.all(
      jobs.map(async job => {
        const [latestRun] = await db
          .select()
          .from(maintenanceJobRuns)
          .where(eq(maintenanceJobRuns.maintenanceJobId, job.id))
          .orderBy(desc(maintenanceJobRuns.createdAt))
          .limit(1);

        return {
          ...job,
          latestRun: latestRun || null,
          // Calculate next run only for enabled jobs
          nextRunAt: job.enabled ? calculateNextRun(job.jobType).toISOString() : null,
        };
      })
    );

    // Create placeholder configs for missing job types (for UI display)
    const allJobTypes = ['sync_rules', 'analyze', 'security_check'] as const;
    const existingTypes = new Set(jobs.map(j => j.jobType));
    const missingConfigs = allJobTypes
      .filter(type => !existingTypes.has(type))
      .map(type => ({
        id: null,
        projectId,
        jobType: type,
        enabled: false,
        createdAt: null,
        updatedAt: null,
        latestRun: null,
        nextRunAt: null,
      }));

    return NextResponse.json({
      jobs: [...jobsWithLatestRun, ...missingConfigs],
    });
  } catch (error) {
    console.error('Error getting maintenance jobs:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PUT /api/projects/[id]/maintenance-jobs
 * Enable/disable a maintenance job type
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    const { hasAccess, project, isOrgAdmin } = await verifyProjectAccess(userId, projectId);
    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Only org admins can update maintenance settings
    if (!isOrgAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can update maintenance settings');
    }

    const body = await request.json();
    const parseResult = updateMaintenanceJobSchema.safeParse(body);
    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const { jobType, enabled } = parseResult.data;

    // Upsert the maintenance job config
    const [job] = await db
      .insert(maintenanceJobs)
      .values({
        projectId,
        jobType,
        enabled,
      })
      .onConflictDoUpdate({
        target: [maintenanceJobs.projectId, maintenanceJobs.jobType],
        set: {
          enabled,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Update scheduled job in BullMQ
    if (enabled) {
      await scheduleMaintenanceJob(job.id, projectId, jobType);
    } else {
      await unscheduleMaintenanceJob(job.id);
    }

    return NextResponse.json({
      job,
      nextRunAt: enabled ? calculateNextRun(jobType).toISOString() : null,
    });
  } catch (error) {
    console.error('Error updating maintenance job:', error);
    return ApiErrorHandler.handle(error);
  }
}

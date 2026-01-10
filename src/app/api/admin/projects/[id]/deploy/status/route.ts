import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { deployJobs, DeployJobStatus, projects } from '@/lib/db/schema';

/**
 * Derive the real job status from fields
 * Handles inconsistent states where status may not match other fields
 */
function deriveJobStatus(job: {
  status: DeployJobStatus;
  error: string | null;
  completedAt: Date | null;
}): DeployJobStatus {
  // If error is set, job failed (regardless of status field)
  if (job.error) {
    return 'failed';
  }
  // If completedAt is set but status is still running/pending, treat as failed
  if (job.completedAt && (job.status === 'running' || job.status === 'pending')) {
    return 'failed';
  }
  return job.status;
}

/**
 * GET /api/admin/projects/[id]/deploy/status
 * Get the latest deploy job status for a project
 * Requires super admin access
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the latest deploy job for this project
    const [latestJob] = await db
      .select()
      .from(deployJobs)
      .where(eq(deployJobs.projectId, projectId))
      .orderBy(desc(deployJobs.createdAt))
      .limit(1);

    if (!latestJob) {
      return NextResponse.json({
        hasJob: false,
        job: null,
      });
    }

    // Parse deployed services if stored
    let deployedServices: string[] = [];
    if (latestJob.deployedServices) {
      try {
        deployedServices = JSON.parse(latestJob.deployedServices);
      } catch {
        deployedServices = [];
      }
    }

    return NextResponse.json({
      hasJob: true,
      job: {
        id: latestJob.id,
        status: deriveJobStatus(latestJob),
        currentStep: latestJob.currentStep,
        deployedServices,
        error: latestJob.error,
        createdAt: latestJob.createdAt,
        startedAt: latestJob.startedAt,
        completedAt: latestJob.completedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/status] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get deploy status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

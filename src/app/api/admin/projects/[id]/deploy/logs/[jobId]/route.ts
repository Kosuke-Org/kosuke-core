import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { deployJobs, projects } from '@/lib/db/schema';

/**
 * GET /api/admin/projects/[id]/deploy/logs/[jobId]
 * Get logs for a specific deploy job
 * Requires super admin access
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId, jobId } = await params;

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the deploy job
    const [deployJob] = await db.select().from(deployJobs).where(eq(deployJobs.id, jobId)).limit(1);

    if (!deployJob) {
      return NextResponse.json({ error: 'Deploy job not found' }, { status: 404 });
    }

    // Verify the job belongs to this project
    if (deployJob.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Deploy job does not belong to this project' },
        { status: 403 }
      );
    }

    // Parse logs if stored
    let logs: unknown[] = [];
    if (deployJob.logs) {
      try {
        logs = JSON.parse(deployJob.logs);
      } catch {
        logs = [];
      }
    }

    // Parse deployed services if stored
    let deployedServices: string[] = [];
    if (deployJob.deployedServices) {
      try {
        deployedServices = JSON.parse(deployJob.deployedServices);
      } catch {
        deployedServices = [];
      }
    }

    return NextResponse.json({
      job: {
        id: deployJob.id,
        status: deployJob.status,
        currentStep: deployJob.currentStep,
        deployedServices,
        error: deployJob.error,
        createdAt: deployJob.createdAt,
        startedAt: deployJob.startedAt,
        completedAt: deployJob.completedAt,
      },
      logs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/logs] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get deploy logs',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { projects, vamosJobs } from '@/lib/db/schema';

/**
 * GET /api/admin/projects/[id]/vamos/logs/[jobId]
 * Get logs for a specific vamos job
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

    // Get the vamos job
    const [vamosJob] = await db.select().from(vamosJobs).where(eq(vamosJobs.id, jobId)).limit(1);

    if (!vamosJob) {
      return NextResponse.json({ error: 'Vamos job not found' }, { status: 404 });
    }

    // Verify the job belongs to this project
    if (vamosJob.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Vamos job does not belong to this project' },
        { status: 403 }
      );
    }

    // Parse logs if stored
    let logs: unknown[] = [];
    if (vamosJob.logs) {
      try {
        logs = JSON.parse(vamosJob.logs);
      } catch {
        logs = [];
      }
    }

    return NextResponse.json({
      job: {
        id: vamosJob.id,
        status: vamosJob.status,
        phase: vamosJob.phase,
        totalPhases: vamosJob.totalPhases,
        completedPhases: vamosJob.completedPhases,
        error: vamosJob.error,
        createdAt: vamosJob.createdAt,
        startedAt: vamosJob.startedAt,
        completedAt: vamosJob.completedAt,
      },
      logs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/vamos/logs] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get vamos logs',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { environmentJobs, projects } from '@/lib/db/schema';

/**
 * GET /api/projects/[id]/environment/status
 * Get the status of the latest environment analysis job for a project
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to this project's org
    if (project.orgId && project.orgId !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the latest environment job for this project
    const [latestJob] = await db
      .select()
      .from(environmentJobs)
      .where(eq(environmentJobs.projectId, projectId))
      .orderBy(desc(environmentJobs.createdAt))
      .limit(1);

    if (!latestJob) {
      return NextResponse.json({
        job: null,
        message: 'No environment analysis job found',
      });
    }

    return NextResponse.json({
      job: {
        id: latestJob.id,
        status: latestJob.status,
        variableCount: latestJob.variableCount,
        error: latestJob.error,
        createdAt: latestJob.createdAt.toISOString(),
        startedAt: latestJob.startedAt?.toISOString() ?? null,
        completedAt: latestJob.completedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[API /environment/status] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get environment status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

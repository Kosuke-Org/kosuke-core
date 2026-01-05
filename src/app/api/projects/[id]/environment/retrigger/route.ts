import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { environmentJobs, projects } from '@/lib/db/schema';
import { environmentQueue, JOB_NAMES } from '@/lib/queue';
import { getSandboxManager } from '@/lib/sandbox';

/**
 * POST /api/projects/[id]/environment/retrigger
 * Re-trigger environment analysis for a project
 * Creates a new environment job and enqueues it
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Only allow re-trigger during requirements_ready phase
    if (project.status !== 'requirements_ready') {
      return NextResponse.json(
        { error: 'Environment can only be re-analyzed during the requirements_ready phase' },
        { status: 400 }
      );
    }

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found for this project' },
        { status: 400 }
      );
    }

    // Create new environment job record in database
    const [environmentJob] = await db
      .insert(environmentJobs)
      .values({
        projectId,
        status: 'pending',
      })
      .returning();

    // Enqueue job to BullMQ for async processing
    await environmentQueue.add(
      JOB_NAMES.ANALYZE_ENVIRONMENT,
      {
        environmentJobId: environmentJob.id,
        projectId,
        sessionId: runningSandbox.sessionId,
        cwd: '/app/project',
      },
      {
        jobId: `env-${environmentJob.id}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    console.log(
      `[API /environment/retrigger] Environment job ${environmentJob.id} enqueued for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      data: {
        environmentJobId: environmentJob.id,
        message: 'Environment analysis re-triggered',
      },
    });
  } catch (error) {
    console.error('[API /environment/retrigger] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to re-trigger environment analysis',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

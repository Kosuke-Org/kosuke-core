import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs, tasks } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { asc, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/build-status/[buildJobId]
 * Get a specific build job with task counts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; buildJobId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, sessionId, buildJobId } = await params;

    // Verify project access
    const hasAccess = await verifyProjectAccess(userId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get the chat session - sessionId from URL is the UUID id
    const chatSession = await db.query.chatSessions.findFirst({
      where: (chatSessions, { and, eq }) =>
        and(eq(chatSessions.projectId, projectId), eq(chatSessions.id, sessionId)),
    });

    if (!chatSession) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    // Get the specific build job
    const [buildJob] = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.id, buildJobId))
      .limit(1);

    if (!buildJob) {
      return NextResponse.json({ error: 'Build job not found' }, { status: 404 });
    }

    // Verify the build job belongs to this session
    if (buildJob.chatSessionId !== chatSession.id) {
      return NextResponse.json(
        { error: 'Build job does not belong to this session' },
        { status: 403 }
      );
    }

    // Get all tasks for this build job (ordered by sequence to match tickets.json order)
    const allTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.buildJobId, buildJob.id))
      .orderBy(asc(tasks.order));

    // Calculate task counts
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'done').length;
    const failedTasks = allTasks.filter(t => t.status === 'error').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;

    return NextResponse.json({
      buildJob: {
        id: buildJob.id,
        status: buildJob.status,
        createdAt: buildJob.createdAt,
        startedAt: buildJob.startedAt,
        completedAt: buildJob.completedAt,
      },
      progress: {
        totalTasks,
        completedTasks,
        failedTasks,
        inProgressTasks,
      },
      tasks: allTasks.map(t => ({
        id: t.id,
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        type: t.type,
        category: t.category,
        estimatedEffort: t.estimatedEffort,
        status: t.status,
        error: t.error,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching build job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { desc, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/latest-build
 * Get the latest build job status for a chat session
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, sessionId } = await params;

    // Verify project access
    const hasAccess = await verifyProjectAccess(userId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get the chat session
    const chatSession = await db.query.chatSessions.findFirst({
      where: (chatSessions, { and, eq }) =>
        and(eq(chatSessions.projectId, projectId), eq(chatSessions.id, sessionId)),
    });

    if (!chatSession) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    // Get the latest build job for this session
    const latestBuild = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.chatSessionId, sessionId))
      .orderBy(desc(buildJobs.createdAt))
      .limit(1);

    return NextResponse.json({
      hasBuild: latestBuild.length > 0,
      status: latestBuild[0]?.status ?? null,
      buildJobId: latestBuild[0]?.id ?? null,
    });
  } catch (error) {
    console.error('Error fetching latest build:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

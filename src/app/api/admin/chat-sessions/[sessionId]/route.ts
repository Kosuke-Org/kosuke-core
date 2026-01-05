import { requireSuperAdmin } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatMessages, chatSessions, projects } from '@/lib/db/schema';
import type { ChatSessionMode } from '@/lib/types';
import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * GET /api/admin/chat-sessions/[sessionId]
 * Get a specific chat session with full details (super admin only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireSuperAdmin();

    const { sessionId } = await params;

    // Fetch session with project info
    const session = await db
      .select({
        id: chatSessions.id,
        projectId: chatSessions.projectId,
        projectName: projects.name,
        projectGithubOwner: projects.githubOwner,
        projectGithubRepoName: projects.githubRepoName,
        userId: chatSessions.userId,
        title: chatSessions.title,
        description: chatSessions.description,
        branchName: chatSessions.branchName,
        status: chatSessions.status,
        mode: chatSessions.mode,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
        lastActivityAt: chatSessions.lastActivityAt,
        messageCount: chatSessions.messageCount,
        isDefault: chatSessions.isDefault,
        branchMergedAt: chatSessions.branchMergedAt,
        branchMergedBy: chatSessions.branchMergedBy,
        mergeCommitSha: chatSessions.mergeCommitSha,
        pullRequestNumber: chatSessions.pullRequestNumber,
      })
      .from(chatSessions)
      .leftJoin(projects, eq(chatSessions.projectId, projects.id))
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session[0]) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { session: session[0] },
    });
  } catch (error) {
    console.error('Error fetching admin chat session:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch chat session' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/chat-sessions/[sessionId]
 * Update chat session mode (super admin only)
 * Used to toggle between 'autonomous' and 'human_assisted' modes
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireSuperAdmin();

    const { userId: adminUserId } = await auth();
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await request.json();
    const { mode } = body as { mode: ChatSessionMode };

    // Validate mode
    if (!mode || !['autonomous', 'human_assisted'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "autonomous" or "human_assisted"' },
        { status: 400 }
      );
    }

    // Fetch current session to check if mode is actually changing
    const currentSession = await db
      .select({ mode: chatSessions.mode, projectId: chatSessions.projectId })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!currentSession[0]) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    const previousMode = currentSession[0].mode;

    // Update session mode
    await db
      .update(chatSessions)
      .set({
        mode,
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, sessionId));

    // Create a system message to notify the user about mode change
    if (previousMode !== mode) {
      const systemContent =
        mode === 'human_assisted'
          ? 'A support agent has joined the conversation. AI responses are paused.'
          : 'Support agent has handed the conversation back to AI. AI responses are now active.';

      await db.insert(chatMessages).values({
        projectId: currentSession[0].projectId,
        chatSessionId: sessionId,
        role: 'system',
        content: systemContent,
        adminUserId,
        timestamp: new Date(),
      });

      // Update message count
      await db
        .update(chatSessions)
        .set({
          messageCount: sql`${chatSessions.messageCount} + 1`,
          lastActivityAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));
    }

    return NextResponse.json({
      success: true,
      data: {
        mode,
        previousMode,
        modeChanged: previousMode !== mode,
      },
    });
  } catch (error) {
    console.error('Error updating chat session mode:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to update chat session mode' }, { status: 500 });
  }
}

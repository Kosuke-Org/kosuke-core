import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatMessages } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/client';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { SandboxClient } from '@/lib/sandbox/client';
import type { RevertToMessageRequest } from '@/lib/types/chat';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Create a system message in the database
 * Used for revert operation notifications
 */
async function createSystemMessage(
  projectId: string,
  chatSessionId: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  console.log(`💬 Creating system message for session ${chatSessionId}`);

  // Create system message in database
  const [savedMessage] = await db
    .insert(chatMessages)
    .values({
      projectId,
      userId,
      content,
      role: 'system',
      modelType: 'system',
      chatSessionId,
      metadata: metadata || null,
    })
    .returning();

  console.log(`✅ System message saved: ${savedMessage.id}`);

  return savedMessage.id;
}

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/revert
 * Revert session to a specific commit SHA
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId } = await params;

    const body: RevertToMessageRequest = await request.json();

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get session info by ID or branchName
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.notFound('Chat session not found');
    }

    // Verify the message exists and belongs to this session
    const [message] = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, body.message_id),
          eq(chatMessages.projectId, projectId),
          eq(chatMessages.chatSessionId, session.id)
        )
      )
      .limit(1);

    if (!message || !message.commitSha) {
      return ApiErrorHandler.notFound('Message not found or no commit associated');
    }

    console.log(
      `🔄 Reverting project ${projectId} session ${session.branchName} to commit ${message.commitSha.substring(0, 8)}`
    );

    // Get GitHub token using project's App installation
    const githubToken = await getProjectGitHubToken(project);

    // Perform git revert operation via sandbox - use session.id (UUID) for sandbox identification
    const sandboxClient = new SandboxClient(session.id);
    const result = await sandboxClient.revert(message.commitSha, githubToken);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Failed to revert to commit',
          details: result.error || 'Git revert operation failed',
        },
        { status: 400 }
      );
    }

    console.log(`✅ Successfully reverted to commit ${message.commitSha.substring(0, 8)}`);

    // Create system message to notify about the revert
    try {
      await createSystemMessage(
        projectId,
        session.id,
        userId,
        'Project restored to the state when this assistant message was created',
        {
          revertInfo: {
            commitSha: message.commitSha,
            revertedAt: new Date().toISOString(),
            messageId: body.message_id,
          },
        }
      );
      console.log(`✅ Sent revert system message for session ${session.branchName}`);
    } catch (systemMessageError) {
      console.warn('Failed to create revert system message:', systemMessageError);
      // Don't fail the revert operation if system message fails
    }

    return NextResponse.json({
      success: true,
      data: {
        success: true,
        reverted_to_commit: message.commitSha,
        message: `Reverted to commit ${message.commitSha.slice(0, 7)}`,
      },
    });
  } catch (error) {
    console.error('Error reverting to message:', error);
    return ApiErrorHandler.serverError(error);
  }
}

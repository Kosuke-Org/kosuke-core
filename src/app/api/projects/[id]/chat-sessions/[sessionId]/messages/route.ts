import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { attachments, chatMessages, messageAttachments } from '@/lib/db/schema';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { asc, eq, inArray } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/messages
 * Get messages for a specific chat session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify chat session exists and belongs to project
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Get messages for the chat session
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatSessionId, session.id))
      .orderBy(asc(chatMessages.timestamp));

    // Fetch attachments for all messages in this session
    const messageIds = messages.map(m => m.id);
    const allMessageAttachments =
      messageIds.length > 0
        ? await db
            .select({
              messageId: messageAttachments.messageId,
              attachment: attachments,
            })
            .from(messageAttachments)
            .innerJoin(attachments, eq(messageAttachments.attachmentId, attachments.id))
            .where(inArray(messageAttachments.messageId, messageIds))
        : [];

    // Group attachments by message ID
    const attachmentsByMessage = allMessageAttachments.reduce(
      (acc, item) => {
        if (!acc[item.messageId]) {
          acc[item.messageId] = [];
        }
        acc[item.messageId].push(item.attachment);
        return acc;
      },
      {} as Record<string, (typeof attachments.$inferSelect)[]>
    );

    // Add attachments to messages
    const messagesWithAttachments = messages.map(message => ({
      ...message,
      attachments: attachmentsByMessage[message.id] || [],
    }));

    return NextResponse.json({
      messages: messagesWithAttachments,
      sessionInfo: {
        id: session.id,
        branchName: session.branchName,
        title: session.title,
        status: session.status,
        messageCount: messages.length,
        mode: session.mode,
      },
    });
  } catch (error) {
    console.error('Error getting chat session messages:', error);
    return ApiErrorHandler.handle(error);
  }
}

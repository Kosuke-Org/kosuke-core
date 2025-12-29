import { requireSuperAdmin } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  chatMessages,
  chatSessions,
  messageAttachments,
  projects,
} from '@/lib/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * GET /api/admin/chat-sessions/[sessionId]/messages
 * Get all messages for a chat session (super admin only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireSuperAdmin();

    const { sessionId } = await params;

    // Verify session exists and get session info
    const session = await db
      .select({
        id: chatSessions.id,
        projectId: chatSessions.projectId,
        projectName: projects.name,
        userId: chatSessions.userId,
        title: chatSessions.title,
        branchName: chatSessions.branchName,
        status: chatSessions.status,
        mode: chatSessions.mode,
        messageCount: chatSessions.messageCount,
      })
      .from(chatSessions)
      .leftJoin(projects, eq(chatSessions.projectId, projects.id))
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session[0]) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    // Fetch all messages for this session
    const messages = await db
      .select({
        id: chatMessages.id,
        projectId: chatMessages.projectId,
        chatSessionId: chatMessages.chatSessionId,
        userId: chatMessages.userId,
        role: chatMessages.role,
        content: chatMessages.content,
        blocks: chatMessages.blocks,
        modelType: chatMessages.modelType,
        timestamp: chatMessages.timestamp,
        tokensInput: chatMessages.tokensInput,
        tokensOutput: chatMessages.tokensOutput,
        contextTokens: chatMessages.contextTokens,
        commitSha: chatMessages.commitSha,
        metadata: chatMessages.metadata,
        adminUserId: chatMessages.adminUserId,
      })
      .from(chatMessages)
      .where(eq(chatMessages.chatSessionId, sessionId))
      .orderBy(asc(chatMessages.timestamp));

    // Fetch attachments for all messages
    const messageIds = messages.map(m => m.id);

    const allAttachments =
      messageIds.length > 0
        ? await db
            .select({
              messageId: messageAttachments.messageId,
              attachment: attachments,
            })
            .from(messageAttachments)
            .innerJoin(attachments, eq(messageAttachments.attachmentId, attachments.id))
            .where(
              sql`${messageAttachments.messageId} = ANY(ARRAY[${sql.join(
                messageIds.map(id => sql`${id}::uuid`),
                sql`, `
              )}])`
            )
        : [];

    // Group attachments by message ID
    const attachmentsByMessageId = allAttachments.reduce(
      (acc, { messageId, attachment }) => {
        if (!acc[messageId]) {
          acc[messageId] = [];
        }
        acc[messageId].push(attachment);
        return acc;
      },
      {} as Record<string, (typeof allAttachments)[number]['attachment'][]>
    );

    // Combine messages with attachments
    const messagesWithAttachments = messages.map(message => ({
      ...message,
      attachments: attachmentsByMessageId[message.id] || [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        messages: messagesWithAttachments,
        sessionInfo: session[0],
      },
    });
  } catch (error) {
    console.error('Error fetching admin chat session messages:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch chat session messages' }, { status: 500 });
  }
}

/**
 * POST /api/admin/chat-sessions/[sessionId]/messages
 * Send a message as admin (super admin only)
 * This will automatically switch the session to human_assisted mode
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireSuperAdmin();

    const { userId: adminUserId } = await auth();
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await request.json();
    const { content } = body as { content: string };

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // Fetch session to get projectId and current mode
    const session = await db
      .select({
        projectId: chatSessions.projectId,
        mode: chatSessions.mode,
      })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session[0]) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    const { projectId, mode: currentMode } = session[0];
    const wasAutonomous = currentMode === 'autonomous';

    // If session was in autonomous mode, switch to human_assisted and add system message
    if (wasAutonomous) {
      // Update session mode
      await db
        .update(chatSessions)
        .set({
          mode: 'human_assisted',
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));

      // Add system message about admin joining
      await db.insert(chatMessages).values({
        projectId,
        chatSessionId: sessionId,
        role: 'system',
        content: 'A support agent has joined the conversation. AI responses are paused.',
        adminUserId,
        timestamp: new Date(),
      });

      // Increment message count for system message
      await db
        .update(chatSessions)
        .set({
          messageCount: sql`${chatSessions.messageCount} + 1`,
        })
        .where(eq(chatSessions.id, sessionId));
    }

    // Insert the admin message
    const [newMessage] = await db
      .insert(chatMessages)
      .values({
        projectId,
        chatSessionId: sessionId,
        role: 'admin',
        content: content.trim(),
        adminUserId,
        timestamp: new Date(),
      })
      .returning();

    // Update session message count and last activity
    await db
      .update(chatSessions)
      .set({
        messageCount: sql`${chatSessions.messageCount} + 1`,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, sessionId));

    return NextResponse.json({
      success: true,
      data: {
        message: newMessage,
        modeChanged: wasAutonomous,
        newMode: 'human_assisted',
      },
    });
  } catch (error) {
    console.error('Error sending admin message:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

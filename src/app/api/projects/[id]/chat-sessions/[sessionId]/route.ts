import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { DatabaseService } from '@/lib/database/service';
import { db } from '@/lib/db/drizzle';
import { chatMessages, chatSessions } from '@/lib/db/schema';
import { deleteDir } from '@/lib/fs/operations';
import { KosukeAgent } from '@/lib/kosuke-agent';
import { getPreviewService } from '@/lib/previews';
import { verifyProjectAccess } from '@/lib/projects';
import { and, eq } from 'drizzle-orm';

// Schema for updating a chat session
const updateChatSessionSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'completed']).optional(),
});

// Schema for sending a message
const sendMessageSchema = z.union([
  z.object({
    message: z.object({
      content: z.string(),
    }),
  }),
  z.object({
    content: z.string(),
  }),
]);

// Error types to match the Agent error types
type ErrorType = 'timeout' | 'parsing' | 'processing' | 'unknown';

/**
 * PUT /api/projects/[id]/chat-sessions/[sessionId]
 * Update a chat session
 */
export async function PUT(
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
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify chat session exists and belongs to project
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Parse request body
    const body = await request.json();
    const parseResult = updateChatSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const updateData = parseResult.data;

    // Update chat session
    const [updatedSession] = await db
      .update(chatSessions)
      .set({
        ...updateData,
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(eq(chatSessions.id, session.id))
      .returning();

    return NextResponse.json({
      session: updatedSession,
    });
  } catch (error) {
    console.error('Error updating chat session:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * DELETE /api/projects/[id]/chat-sessions/[sessionId]
 * Delete a chat session and associated messages
 */
export async function DELETE(
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
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify chat session exists and belongs to project
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Prevent deletion of default chat session
    if (session.isDefault) {
      return ApiErrorHandler.badRequest('Cannot delete default chat session');
    }

    // Step 1: Destroy the preview container for this session (full removal since session is being deleted)
    try {
      console.log(`Destroying preview for session ${sessionId} in project ${projectId}`);
      const previewService = getPreviewService();
      await previewService.stopPreview(projectId, sessionId, true);
      console.log(`Preview destroyed successfully for session ${sessionId}`);
    } catch (containerError) {
      // Log but continue - we still want to delete the session even if container cleanup fails
      console.error(`Error stopping preview container for session ${sessionId}:`, containerError);
      console.log(`Continuing with session deletion despite container cleanup failure`);
    }

    // Step 2: Delete session files after container is stopped
    const { sessionManager } = await import('@/lib/sessions');
    const sessionPath = sessionManager.getSessionPath(projectId, sessionId);
    let filesWarning = null;

    try {
      await deleteDir(sessionPath);
      console.log(`Successfully deleted session directory: ${sessionPath}`);
    } catch (dirError) {
      console.error(`Error deleting session directory: ${sessionPath}`, dirError);
      filesWarning = 'Session deleted but some files could not be removed';
    }

    // Step 3: Delete chat session from database (cascade will delete associated messages)
    await db.delete(chatSessions).where(eq(chatSessions.id, session.id));

    return NextResponse.json({
      success: true,
      message: 'Chat session deleted successfully',
      ...(filesWarning && { warning: filesWarning }),
    });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]
 * Send a message to a specific chat session
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
): Promise<Response> {
  try {
    // Get the session
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Await params to get the id and sessionId
    const { id: projectId, sessionId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get the chat session and verify it belongs to this project
    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!chatSession) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Parse JSON request
    const body = await req.json();
    const parseResult = sendMessageSchema.safeParse(body);

    if (!parseResult.success) {
      console.error('Invalid request format:', parseResult.error);
      return ApiErrorHandler.validationError(parseResult.error);
    }

    // Extract content based on the format received
    let messageContent: string;
    if ('message' in parseResult.data) {
      messageContent = parseResult.data.message.content;
    } else {
      messageContent = parseResult.data.content;
    }

    console.log(
      `📝 Received message content: "${messageContent.substring(0, 250)}${messageContent.length > 250 ? '...' : ''}"`
    );

    // Save user message immediately
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        projectId,
        chatSessionId: chatSession.id,
        userId: userId,
        content: messageContent,
        role: 'user',
        modelType: 'premium',
        tokensInput: 0,
        tokensOutput: 0,
        contextTokens: 0,
      })
      .returning();

    console.log(`✅ User message saved with ID: ${userMessage.id}`);

    // Update session's lastActivityAt to track activity for cleanup
    await db
      .update(chatSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(chatSessions.id, chatSession.id));

    // Create assistant message placeholder for streaming
    const [assistantMessage] = await db
      .insert(chatMessages)
      .values({
        projectId,
        chatSessionId: chatSession.id,
        userId: userId,
        content: null, // Will be populated by webhook
        role: 'assistant',
        modelType: 'premium',
      })
      .returning();

    console.log(`✅ Assistant message placeholder created with ID: ${assistantMessage.id}`);

    // Validate session directory exists
    const { sessionManager: sm } = await import('@/lib/sessions');
    const sessionValid = await sm.validateSessionDirectory(projectId, chatSession.sessionId);

    if (!sessionValid) {
      return new Response(
        JSON.stringify({
          error:
            'Session environment not found. Start a preview for this session first to initialize the environment.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Session environment validated for session ${chatSession.sessionId}`);

    // Create a ReadableStream for Kosuke agent
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log(`🚀 Starting Kosuke agent stream for session ${chatSession.sessionId}`);

          // Get session database URL for migrations
          const databaseService = new DatabaseService(projectId, chatSession.sessionId);
          const dbUrl = databaseService.getDatabaseUrl();

          const kosukeAgent = await KosukeAgent.create({
            orgId: project.orgId || projectId, // Use projectId as fallback if no org
            projectId,
            sessionId: chatSession.sessionId,
            cwd: sm.getSessionPath(projectId, chatSession.sessionId),
            dbUrl,
            userId,
            isImported: project.isImported,
            enableReview: true,
            enableTest: false, // Can be configured later
          });

          // Stream events from Kosuke agent
          for await (const event of kosukeAgent.run(messageContent, assistantMessage.id)) {
            const data = JSON.stringify(event);
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          }

          // Send completion marker
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('❌ Error in agent stream:', error);

          // Send error event
          const errorEvent = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
        }
      },
    });

    // Return streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Assistant-Message-Id': assistantMessage.id.toString(),
      },
    });
  } catch (error) {
    console.error('Error in session chat endpoint:', error);

    // Determine error type for better client handling
    let errorType: ErrorType = 'unknown';
    let errorMessage = 'Error processing request';

    if (error instanceof Error) {
      errorMessage = error.message;
      // Try to determine error type
      if ('errorType' in error && typeof (error as Record<string, unknown>).errorType === 'string') {
        errorType = (error as Record<string, unknown>).errorType as ErrorType;
      } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
        errorType = 'timeout';
      } else if (error.message.includes('parse') || error.message.includes('JSON')) {
        errorType = 'parsing';
      } else {
        errorType = 'processing';
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        errorType,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

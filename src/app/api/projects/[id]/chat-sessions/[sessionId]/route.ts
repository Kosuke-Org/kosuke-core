import type { MessageAttachmentPayload } from '@kosuke-ai/cli';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { DatabaseService } from '@/lib/database/service';
import { db } from '@/lib/db/drizzle';
import { attachments, chatMessages, chatSessions, messageAttachments } from '@/lib/db/schema';
import { deleteDir } from '@/lib/fs/operations';
import { KosukeAgent } from '@/lib/kosuke-agent';
import { getPreviewService } from '@/lib/previews';
import { verifyProjectAccess } from '@/lib/projects';
import { uploadFile } from '@/lib/storage';
import { and, eq } from 'drizzle-orm';

// Schema for updating a chat session
const updateChatSessionSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'completed']).optional(),
});

// Schema for sending a message - support both formats
const sendMessageSchema = z.union([
  z.object({
    message: z.object({
      content: z.string()
    }),
  }),
  z.object({
    content: z.string(),
  })
]);

// Error types to match the Agent error types
type ErrorType = 'timeout' | 'parsing' | 'processing' | 'unknown';

/**
 * Save an uploaded file (image or document) to storage
 * Uses public URLs instead of base64 encoding for Claude API
 */
async function saveUploadedFile(file: File, projectId: string): Promise<MessageAttachmentPayload> {
  // Create a prefix to organize files by project
  const prefix = `attachments/project-${projectId}`;

  try {
    // Upload the file using the generic uploadFile function
    const uploadResult = await uploadFile(file, prefix);

    return {
      upload: uploadResult,
    } satisfies MessageAttachmentPayload;
  } catch (error) {
    console.error('Error uploading file to storage:', error);
    throw new Error('Failed to upload file');
  }
}

/**
 * Process a FormData request and extract the content and attachment
 */
async function processFormDataRequest(req: NextRequest, projectId: string): Promise<{
  content: string;
  includeContext: boolean;
  contextFiles: Array<{ name: string; content: string; }>;
  attachments: MessageAttachmentPayload[];
}> {
  const formData = await req.formData();
  const content = formData.get('content') as string || '';
  const includeContext = formData.get('includeContext') === 'true';
  const contextFilesStr = formData.get('contextFiles') as string || '[]';
  const contextFiles = JSON.parse(contextFilesStr);

  // Process all attachments (images and documents)
  const attachments: MessageAttachmentPayload[] = [];
  const attachmentCount = parseInt(formData.get('attachmentCount') as string || '0', 10);

  for (let i = 0; i < attachmentCount; i++) {
    const attachmentFile = formData.get(`attachment_${i}`) as File | null;
    if (attachmentFile) {
      const attachment = await saveUploadedFile(attachmentFile, projectId);
      attachments.push(attachment);
    }
  }

  return {
    content,
    includeContext,
    contextFiles,
    attachments,
  };
}

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
      .where(
        and(
          eq(chatSessions.projectId, projectId),
          eq(chatSessions.sessionId, sessionId)
        )
      );

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
      .where(
        and(
          eq(chatSessions.projectId, projectId),
          eq(chatSessions.sessionId, sessionId)
        )
      );

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
      filesWarning = "Session deleted but some files could not be removed";
    }

    // Step 3: Delete chat session from database (cascade will delete associated messages)
    await db
      .delete(chatSessions)
      .where(eq(chatSessions.id, session.id));

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
      .where(
        and(
          eq(chatSessions.projectId, projectId),
          eq(chatSessions.sessionId, sessionId)
        )
      );

    if (!chatSession) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Parse request body - support both JSON and FormData
    const contentType = req.headers.get('content-type') || '';
    let messageContent: string;
    let includeContext = false;
    let contextFiles: string[] = [];
    let attachmentPayloads: MessageAttachmentPayload[] = [];

    if (contentType.includes('multipart/form-data')) {
      // Process FormData request (for file uploads)
      console.log('Processing multipart/form-data request');
      const formData = await processFormDataRequest(req, projectId);
      messageContent = formData.content;
      includeContext = formData.includeContext;
      contextFiles = formData.contextFiles.map(f => f.content);
      attachmentPayloads = formData.attachments;

      if (attachmentPayloads.length > 0) {
        console.log(`⬆️ ${attachmentPayloads.length} file(s) uploaded`);
        attachmentPayloads.forEach((attachment, index) => {
          console.log(`⬆️ Attachment [${index + 1}] uploaded: ${attachment.upload.fileUrl}`);
        });
      }
    } else {
      // Process JSON request for text messages
      console.log('Processing JSON request for streaming');
      const body = await req.json();
      console.log('Request body:', JSON.stringify(body));

      const parseResult = sendMessageSchema.safeParse(body);

      if (!parseResult.success) {
        console.error('Invalid request format:', parseResult.error);
        return ApiErrorHandler.validationError(parseResult.error);
      }

      // Extract content based on the format received
      if ('message' in parseResult.data) {
        // Format: { message: { content } }
        messageContent = parseResult.data.message.content;
      } else {
        // Format: { content }
        messageContent = parseResult.data.content;
      }

      // Extract options if present
      if ('includeContext' in body) {
        includeContext = body.includeContext || false;
      }
      if ('contextFiles' in body) {
        contextFiles = body.contextFiles || [];
      }
    }

    console.log(`📝 Received message content: "${messageContent.substring(0, 250)}${messageContent.length > 250 ? '...' : ''}"`);

    // Save user message immediately
    const [userMessage] = await db.insert(chatMessages).values({
      projectId,
      chatSessionId: chatSession.id,
      userId: userId,
      content: messageContent,
      role: 'user',
      modelType: 'premium',
      tokensInput: 0, // Token counting moved to webhook
      tokensOutput: 0,
      contextTokens: 0,
    }).returning();

    console.log(`✅ User message saved with ID: ${userMessage.id}`);

    // Update session's lastActivityAt to track activity for cleanup
    await db
      .update(chatSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(chatSessions.id, chatSession.id));

    // Save all attachments if present
    if (attachmentPayloads.length > 0) {
      for (const attachmentPayload of attachmentPayloads) {
        const { upload: uploadResult } = attachmentPayload;
        const [attachment] = await db.insert(attachments).values({
          projectId,
          filename: uploadResult.filename,
          storedFilename: uploadResult.storedFilename,
          fileUrl: uploadResult.fileUrl,
          fileType: uploadResult.fileType,
          mediaType: uploadResult.mediaType,
          fileSize: uploadResult.fileSize,
        }).returning();

        // Link attachment to message
        await db.insert(messageAttachments).values({
          messageId: userMessage.id,
          attachmentId: attachment.id,
        });

        console.log(`✅ Attachment saved and linked to message: ${attachment.id}`);
      }
    }

    // Create assistant message placeholder for streaming
    const [assistantMessage] = await db.insert(chatMessages).values({
      projectId,
      chatSessionId: chatSession.id,
      userId: userId,
      content: null, // Will be populated by webhook
      role: 'assistant',
      modelType: 'premium',
    }).returning();

    console.log(`✅ Assistant message placeholder created with ID: ${assistantMessage.id}`);

    // Mark unused variables for future use
    void includeContext;
    void contextFiles;

    // Validate session directory exists
    const { sessionManager: sm } = await import('@/lib/sessions');
    const sessionValid = await sm.validateSessionDirectory(projectId, chatSession.sessionId);

    if (!sessionValid) {
      return new Response(
        JSON.stringify({
          error: 'Session environment not found. Start a preview for this session first to initialize the environment.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
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
              enableReview: true,
              enableTest: false, // Can be configured later
            });

          // Stream events from Kosuke agent (with optional attachments for plan phase)
          for await (const event of kosukeAgent.run(
            messageContent,
            assistantMessage.id,
            attachmentPayloads.length > 0 ? attachmentPayloads : undefined
          )) {
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
        'Connection': 'keep-alive',
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
        errorType
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

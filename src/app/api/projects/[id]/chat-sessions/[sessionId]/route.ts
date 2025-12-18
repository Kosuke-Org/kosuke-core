import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import {
  attachments,
  buildJobs,
  chatMessages,
  chatSessions,
  messageAttachments,
  tasks,
} from '@/lib/db/schema';
import { getGitHubToken, getOctokit } from '@/lib/github/client';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { buildQueue } from '@/lib/queue';
import { getSandboxConfig, getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { getSandboxDatabaseUrl } from '@/lib/sandbox/database';
import { MessageAttachmentPayload, uploadFile } from '@/lib/storage';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';

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
async function processFormDataRequest(
  req: NextRequest,
  projectId: string
): Promise<{
  content: string;
  includeContext: boolean;
  contextFiles: Array<{ name: string; content: string }>;
  attachments: MessageAttachmentPayload[];
}> {
  const formData = await req.formData();
  const content = (formData.get('content') as string) || '';
  const includeContext = formData.get('includeContext') === 'true';
  const contextFilesStr = (formData.get('contextFiles') as string) || '[]';
  const contextFiles = JSON.parse(contextFilesStr);

  // Process all attachments (images and documents)
  const attachments: MessageAttachmentPayload[] = [];
  const attachmentCount = parseInt((formData.get('attachmentCount') as string) || '0', 10);

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
 * Close a GitHub PR
 */
async function closePullRequest(
  github: Awaited<ReturnType<typeof getOctokit>>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<boolean> {
  try {
    await github.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: 'closed',
    });
    console.log(`✅ Closed PR #${pullNumber}`);
    return true;
  } catch (error) {
    console.error(`Error closing PR #${pullNumber}:`, error);
    return false;
  }
}

/**
 * Reopen a GitHub PR
 */
async function reopenPullRequest(
  github: Awaited<ReturnType<typeof getOctokit>>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<boolean> {
  try {
    await github.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: 'open',
    });
    console.log(`✅ Reopened PR #${pullNumber}`);
    return true;
  } catch (error) {
    console.error(`Error reopening PR #${pullNumber}:`, error);
    return false;
  }
}

/**
 * PUT /api/projects/[id]/chat-sessions/[sessionId]
 * Update a chat session (archive/unarchive will close/reopen PR)
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
    const session = await findChatSession(projectId, sessionId);

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

    // Handle status changes that affect GitHub PR
    if (
      updateData.status &&
      updateData.status !== session.status &&
      project.githubOwner &&
      project.githubRepoName &&
      session.pullRequestNumber
    ) {
      try {
        const github = await getOctokit(project.isImported, userId);

        if (updateData.status === 'archived' && session.status === 'active') {
          // Archiving: close the PR
          await closePullRequest(
            github,
            project.githubOwner,
            project.githubRepoName,
            session.pullRequestNumber
          );
        } else if (updateData.status === 'active' && session.status === 'archived') {
          // Unarchiving: reopen the PR
          await reopenPullRequest(
            github,
            project.githubOwner,
            project.githubRepoName,
            session.pullRequestNumber
          );
        }
        // Note: 'completed' status is set by webhook when PR is merged, shouldn't be set manually
      } catch (error) {
        console.error('Error updating PR status:', error);
        // Continue with session update even if PR update fails
      }
    }

    // Destroy sandbox when archiving (free up resources)
    if (updateData.status === 'archived' && session.status !== 'archived') {
      try {
        console.log(
          `Destroying sandbox for archived session ${session.id} in project ${projectId}`
        );
        const sandboxManager = getSandboxManager();
        await sandboxManager.destroySandbox(session.id);
        console.log(`Sandbox destroyed successfully for session ${session.id}`);
      } catch (containerError) {
        Sentry.captureException(containerError);
        // Log but continue - we still want to archive the session even if container cleanup fails
        console.error(`Error destroying sandbox for session ${session.id}:`, containerError);
        console.log(`Continuing with session archival despite container cleanup failure`);
      }
    }

    // Update chat session
    const [updatedSession] = await db
      .update(chatSessions)
      .set({
        ...updateData,
        updatedAt: new Date(),
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
 * Delete a chat session and associated sandbox
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
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Prevent deletion of default chat session
    if (session.isDefault) {
      return ApiErrorHandler.badRequest('Cannot delete default chat session');
    }

    // Step 1: Destroy the sandbox container for this session
    try {
      console.log(`Destroying sandbox for session ${session.id} in project ${projectId}`);
      const sandboxManager = getSandboxManager();
      await sandboxManager.destroySandbox(session.id);
      console.log(`Sandbox destroyed successfully for session ${session.id}`);
    } catch (containerError) {
      Sentry.captureException(containerError);
      // Log but continue - we still want to delete the session even if container cleanup fails
      console.error(`Error destroying sandbox for session ${session.id}:`, containerError);
      console.log(`Continuing with session deletion despite container cleanup failure`);
    }

    // Step 2: Delete chat session from database (cascade will delete associated messages)
    await db.delete(chatSessions).where(eq(chatSessions.id, session.id));

    return NextResponse.json({
      success: true,
      message: 'Chat session deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]
 * Send a message to a specific chat session via sandbox agent
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
    const chatSession = await findChatSession(projectId, sessionId);

    if (!chatSession) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Parse request body - support both JSON and FormData
    const contentType = req.headers.get('content-type') || '';
    let messageContent: string;
    let attachmentPayloads: MessageAttachmentPayload[] = [];

    if (contentType.includes('multipart/form-data')) {
      // Process FormData request (for file uploads)
      console.log('Processing multipart/form-data request');
      const formData = await processFormDataRequest(req, projectId);
      messageContent = formData.content;
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
        tokensInput: 0, // Token counting moved to webhook
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

    // Save all attachments if present
    if (attachmentPayloads.length > 0) {
      for (const attachmentPayload of attachmentPayloads) {
        const { upload: uploadResult } = attachmentPayload;
        const [attachment] = await db
          .insert(attachments)
          .values({
            projectId,
            filename: uploadResult.filename,
            storedFilename: uploadResult.storedFilename,
            fileUrl: uploadResult.fileUrl,
            fileType: uploadResult.fileType,
            mediaType: uploadResult.mediaType,
            fileSize: uploadResult.fileSize,
          })
          .returning();

        // Link attachment to message
        await db.insert(messageAttachments).values({
          messageId: userMessage.id,
          attachmentId: attachment.id,
        });

        console.log(`✅ Attachment saved and linked to message: ${attachment.id}`);
      }
    }

    // Get Claude session ID from chat session (for resuming clarification conversations)
    const claudeSessionId = chatSession.claudeSessionId;

    if (claudeSessionId) {
      console.log(`🔄 Resuming Claude session: ${claudeSessionId}`);
    } else {
      console.log(`🆕 Starting new Claude session`);
    }

    // Create assistant message placeholder for streaming
    const [assistantMessage] = await db
      .insert(chatMessages)
      .values({
        projectId,
        chatSessionId: chatSession.id,
        userId: userId,
        content: null, // Will be populated by completion event
        role: 'assistant',
        modelType: 'premium',
      })
      .returning();

    console.log(`✅ Assistant message placeholder created with ID: ${assistantMessage.id}`);

    // Get GitHub token based on project ownership
    const githubToken = await getGitHubToken(project.isImported, userId);

    if (!githubToken) {
      return new Response(
        JSON.stringify({
          error: 'GitHub token not available. Please connect your GitHub account.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🔗 GitHub integration enabled for session: ${chatSession.id}`);

    // Check if sandbox is running - use session.id (UUID) for sandbox identification
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(chatSession.id);

    if (!sandbox || sandbox.status !== 'running') {
      return new Response(
        JSON.stringify({
          error:
            'Sandbox not running. Start a preview for this session first to initialize the environment.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Sandbox running for session ${chatSession.id}`);
    console.log(`🚀 Starting conversation stream for session ${chatSession.id}`);

    // Create SandboxClient to communicate with kosuke serve
    const sandboxClient = new SandboxClient(chatSession.id);

    // Create a ReadableStream that proxies the sandbox stream
    const stream = new ReadableStream({
      async start(controller) {
        // Track accumulated content and blocks for final database save
        let accumulatedContent = '';
        const accumulatedBlocks: Array<
          | { type: 'text'; content: string }
          | {
              type: 'tool';
              name: string;
              input: Record<string, unknown>;
              result?: string;
              status: 'running' | 'completed' | 'error';
            }
        > = [];

        try {
          // Stream events from kosuke serve /api/plan (plan phase only)
          const planStream = sandboxClient.streamPlan(messageContent, '/app/project', {
            resume: claudeSessionId, // Resume previous conversation if exists
          });

          for await (const event of planStream) {
            const eventData = event.data as Record<string, unknown> | undefined;

            // Accumulate message content and blocks for database storage
            if (event.type === 'tool_call') {
              // Track tool calls as blocks
              const toolData = eventData as
                | { action?: string; params?: Record<string, unknown> }
                | undefined;
              if (toolData?.action) {
                accumulatedBlocks.push({
                  type: 'tool',
                  name: toolData.action,
                  input: toolData.params || {},
                  status: 'completed',
                });
              }
            } else if (event.type === 'message') {
              const messageData = eventData as { text?: string } | undefined;
              if (messageData?.text) {
                accumulatedContent += messageData.text + '\n\n';
                // Also add text as a block
                accumulatedBlocks.push({
                  type: 'text',
                  content: messageData.text,
                });
              }
            }

            // Check if this is a done event with input_required (clarification needed)
            if (
              event.type === 'done' &&
              eventData &&
              eventData.status === 'input_required' &&
              typeof eventData.sessionId === 'string'
            ) {
              // Save Claude session ID to chat session for resuming clarification conversations
              const savedSessionId = eventData.sessionId;

              await db
                .update(chatSessions)
                .set({ claudeSessionId: savedSessionId })
                .where(eq(chatSessions.id, chatSession.id));

              console.log(`💾 Saved Claude session ID to chat session: ${savedSessionId}`);
            }

            // Check if plan succeeded with tickets → save tasks and enqueue build
            if (
              event.type === 'done' &&
              eventData &&
              eventData.status === 'success' &&
              typeof eventData.ticketsFile === 'string'
            ) {
              console.log(`📋 Plan succeeded, reading tickets from: ${eventData.ticketsFile}`);

              // Read tickets.json from sandbox
              const ticketsJson = await sandboxClient.readFile(eventData.ticketsFile);
              const ticketsData = JSON.parse(ticketsJson);
              const tickets = ticketsData.tickets || [];
              // Use internal sandbox URL (bun service runs on localhost inside container)
              const sandboxConfig = getSandboxConfig();
              const testUrl = `http://localhost:${sandboxConfig.bunPort}`;

              console.log(`📝 Found ${tickets.length} tickets to save`);

              // Create build job (capture claudeSessionId for audit trail)
              const buildJobResult = await db
                .insert(buildJobs)
                .values({
                  projectId,
                  chatSessionId: chatSession.id,
                  claudeSessionId: claudeSessionId ?? null,
                  status: 'pending',
                })
                .returning();

              const buildJob = buildJobResult[0];

              // Save tasks to database
              await db.insert(tasks).values(
                tickets.map(
                  (
                    ticket: {
                      id: string;
                      title: string;
                      description: string;
                      type?: string;
                      category?: string;
                      estimatedEffort?: number;
                    },
                    index: number
                  ) => ({
                    buildJobId: buildJob.id,
                    externalId: ticket.id,
                    title: ticket.title,
                    description: ticket.description,
                    type: ticket.type || null,
                    category: ticket.category || null,
                    estimatedEffort: ticket.estimatedEffort || 1,
                    order: index, // Preserve tickets.json order
                    status: 'todo' as const,
                  })
                )
              );

              console.log(`✅ Saved ${tickets.length} tasks to database`);

              // Enqueue build job with relative tickets path
              // Remove /app/project prefix from ticketsFile to make it relative
              const relativeTicketsPath = eventData.ticketsFile.startsWith('/app/project/')
                ? eventData.ticketsFile.slice('/app/project/'.length)
                : eventData.ticketsFile;

              await buildQueue.add('build', {
                buildJobId: buildJob.id,
                chatSessionId: chatSession.id,
                projectId,
                sessionId: chatSession.id, // Use UUID for sandbox identification
                ticketsPath: relativeTicketsPath,
                cwd: '/app/project',
                dbUrl: getSandboxDatabaseUrl(chatSession.id),
                githubToken,
                baseBranch: project.defaultBranch || 'main', // Review diffs feature branch vs base
                enableReview: true, // Review runs once after all tickets
                enableTest: sandboxConfig.test,
                testUrl,
              });

              console.log(`🚀 Enqueued build job ${buildJob.id}`);

              // Save buildJobId to message metadata so BuildMessage component shows
              await db
                .update(chatMessages)
                .set({ metadata: { buildJobId: buildJob.id } })
                .where(eq(chatMessages.id, assistantMessage.id));

              console.log(`💾 Saved buildJobId to message metadata: ${buildJob.id}`);

              // Clear claudeSessionId since plan is complete (build is starting)
              await db
                .update(chatSessions)
                .set({ claudeSessionId: null })
                .where(eq(chatSessions.id, chatSession.id));

              console.log(`🧹 Cleared claudeSessionId from chat session (plan complete)`);

              // Add buildJobId to done event
              const enhancedEvent = {
                ...event,
                data: {
                  ...eventData,
                  buildJobId: buildJob.id,
                },
              };

              // Send enhanced event with buildJobId
              const data = JSON.stringify(enhancedEvent);
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
              continue;
            }

            // Format as Server-Sent Events
            const data = JSON.stringify(event);
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          }

          // Save accumulated content and blocks to database before completing
          // Note: metadata (claudeSessionId) was already saved immediately when received
          if (accumulatedContent.trim() || accumulatedBlocks.length > 0) {
            const updateData: {
              content?: string | null;
              blocks?: typeof accumulatedBlocks | null;
            } = {};

            if (accumulatedContent.trim()) {
              updateData.content = accumulatedContent.trim();
            }

            if (accumulatedBlocks.length > 0) {
              updateData.blocks = accumulatedBlocks;
            }

            await db
              .update(chatMessages)
              .set(updateData)
              .where(eq(chatMessages.id, assistantMessage.id));

            console.log(
              `💾 Saved to DB: ${accumulatedContent.length} chars, ${accumulatedBlocks.length} blocks`
            );
          }

          // Send completion marker
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('❌ Error in conversation stream:', error);

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
      if (
        'errorType' in error &&
        typeof (error as Record<string, unknown>).errorType === 'string'
      ) {
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

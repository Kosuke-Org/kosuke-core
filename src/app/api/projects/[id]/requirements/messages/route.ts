import { REQUIREMENTS_EVENTS } from '@Kosuke-Org/cli';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { chatMessages, chatSessions, projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';
import type { SandboxInfo } from '@/lib/sandbox/types';

/**
 * Find a running and healthy sandbox for a project
 * Prefers the sandbox from the default session, falls back to any healthy sandbox
 */
async function findHealthySandbox(
  projectId: string
): Promise<{ sandbox: SandboxInfo; sessionId: string } | null> {
  const manager = getSandboxManager();

  // Get all sandboxes for this project
  const sandboxes = await manager.listProjectSandboxes(projectId);
  const runningSandboxes = sandboxes.filter(s => s.status === 'running');

  if (runningSandboxes.length === 0) {
    return null;
  }

  // Get default session to prefer its sandbox
  const defaultSession = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)),
  });

  // Order sandboxes: default session first, then others
  const orderedSandboxes = defaultSession
    ? [
        ...runningSandboxes.filter(s => s.sessionId === defaultSession.id),
        ...runningSandboxes.filter(s => s.sessionId !== defaultSession.id),
      ]
    : runningSandboxes;

  // Find first sandbox with healthy agent
  for (const sandbox of orderedSandboxes) {
    try {
      const client = new SandboxClient(sandbox.sessionId);
      const health = await client.getAgentHealth();

      if (health?.status === 'ok' && health.alive) {
        console.log(`[API /requirements/messages] Found healthy sandbox: ${sandbox.sessionId}`);
        return { sandbox, sessionId: sandbox.sessionId };
      }
    } catch (error) {
      console.log(
        `[API /requirements/messages] Sandbox ${sandbox.sessionId} agent not healthy:`,
        error
      );
    }
  }

  return null;
}

/**
 * Get the default (main) session for a project
 */
async function getDefaultSession(projectId: string) {
  return db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)),
  });
}

/**
 * GET /api/projects/[id]/requirements/messages
 * Fetch all requirements messages for a project
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Get default session
    const defaultSession = await getDefaultSession(projectId);

    if (!defaultSession) {
      return NextResponse.json({ error: 'Default session not found' }, { status: 404 });
    }

    // Get all requirements messages from the main session, ordered by timestamp
    const messages = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatSessionId, defaultSession.id),
          eq(chatMessages.messageType, 'requirements')
        )
      )
      .orderBy(chatMessages.timestamp);

    return NextResponse.json({
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        blocks: msg.blocks,
        timestamp: msg.timestamp,
      })),
    });
  } catch (error) {
    console.error('[API /requirements/messages] GET Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch requirements messages',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Convert DB messages to Anthropic message format for session continuity
 */
function convertToAnthropicMessages(
  messages: Array<{ role: string; content: string | null }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .filter(msg => msg.content !== null)
    .map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content!,
    }));
}

/**
 * POST /api/projects/[id]/requirements/messages
 * Send a new message in requirements gathering
 * Streams AI response via SSE from sandbox
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify user has access to this project's org
    if (project.orgId && project.orgId !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if project is in requirements status
    if (project.status !== 'requirements') {
      return new Response(
        JSON.stringify({
          error: 'Project must be in requirements status to send messages',
          currentStatus: project.status,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get default session for storing requirements messages
    const defaultSession = await getDefaultSession(projectId);

    if (!defaultSession) {
      return new Response(JSON.stringify({ error: 'Default session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Insert user message into chat_messages with messageType: 'requirements'
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        projectId,
        chatSessionId: defaultSession.id,
        userId,
        role: 'user',
        content,
        messageType: 'requirements',
      })
      .returning();

    console.log(`[API /requirements/messages] User message saved: ${userMessage.id}`);

    // Get previous requirements messages for session continuity
    const previousDbMessages = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatSessionId, defaultSession.id),
          eq(chatMessages.messageType, 'requirements')
        )
      )
      .orderBy(chatMessages.timestamp);

    // Convert to Anthropic format (excluding the message we just added - it will be sent as the new message)
    const previousMessages = convertToAnthropicMessages(
      previousDbMessages.slice(0, -1) // Exclude last message (the one we just inserted)
    );

    const isFirstRequest = previousMessages.length === 0;

    // Find a running and healthy sandbox for this project
    const healthySandbox = await findHealthySandbox(projectId);

    if (!healthySandbox) {
      return new Response(
        JSON.stringify({
          error: 'Sandbox not running. Start a preview first to initialize the environment.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { sessionId } = healthySandbox;
    console.log(`[API /requirements/messages] Using sandbox session ${sessionId}`);

    // Create SandboxClient for streaming
    const client = new SandboxClient(sessionId);

    // Create SSE streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let assistantResponse = '';
        let docsCreated = false;
        let docsContent: string | undefined;

        try {
          console.log(`[API /requirements/messages] Starting SSE stream...`);

          for await (const event of client.streamRequirements(content, '/app/project', {
            previousMessages,
            isFirstRequest,
          })) {
            const eventData = event as { type?: string; data?: Record<string, unknown> };

            // Forward events to client in real-time
            if (eventData.type === REQUIREMENTS_EVENTS.STARTED) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (eventData.type === REQUIREMENTS_EVENTS.MESSAGE && eventData.data) {
              const text = (eventData.data as { text?: string }).text;
              if (text) {
                assistantResponse += text;
              }
              // Stream message event immediately to client
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (eventData.type === REQUIREMENTS_EVENTS.TOOL_CALL) {
              // Stream tool call events to client
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (eventData.type === REQUIREMENTS_EVENTS.TOOL_RESULT) {
              // Stream tool result events to client
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (eventData.type === REQUIREMENTS_EVENTS.SEARCH_RESULTS) {
              // Stream search results events to client (web search results)
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (eventData.type === REQUIREMENTS_EVENTS.DONE && eventData.data) {
              const doneData = eventData.data as {
                response?: string;
                docsCreated?: boolean;
                docsContent?: string;
                error?: string;
              };

              if (doneData.error) {
                // Send error in done event
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ type: REQUIREMENTS_EVENTS.DONE, data: { error: doneData.error } })}\n\n`
                  )
                );
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }

              // Use the full response if provided
              if (doneData.response) {
                assistantResponse = doneData.response;
              }
              docsCreated = doneData.docsCreated || false;
              docsContent = doneData.docsContent;
            }
          }

          console.log(
            `[API /requirements/messages] Stream complete, saving (${assistantResponse.length} chars)`
          );

          // Save assistant message to DB after stream completes
          const [assistantMessage] = await db
            .insert(chatMessages)
            .values({
              projectId,
              chatSessionId: defaultSession.id,
              userId,
              role: 'assistant',
              content: assistantResponse,
              messageType: 'requirements',
            })
            .returning();

          console.log(
            `[API /requirements/messages] Assistant message saved: ${assistantMessage.id}`
          );

          // Send done event with saved message info
          const doneEvent = {
            type: REQUIREMENTS_EVENTS.DONE,
            data: {
              message: {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: assistantMessage.content,
                timestamp: assistantMessage.timestamp,
              },
              docsCreated,
              docsContent,
            },
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[API /requirements/messages] Stream error:', error);
          const errorEvent = {
            type: REQUIREMENTS_EVENTS.ERROR,
            data: {
              error: error instanceof Error ? error.message : 'Unknown error occurred',
            },
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    // Return SSE streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-User-Message-Id': userMessage.id,
      },
    });
  } catch (error) {
    console.error('[API /requirements/messages] POST Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

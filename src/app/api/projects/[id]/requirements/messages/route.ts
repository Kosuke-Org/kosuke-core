import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects, requirementsMessages } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * Generate a session ID for requirements sandbox based on project ID
 */
function getRequirementsSessionId(projectId: string): string {
  return `req-${projectId}`;
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

    // Get all messages ordered by timestamp
    const messages = await db
      .select()
      .from(requirementsMessages)
      .where(eq(requirementsMessages.projectId, projectId))
      .orderBy(requirementsMessages.timestamp);

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
 * Triggers AI response via sandbox
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to this project's org
    if (project.orgId && project.orgId !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if project is in requirements status
    if (project.status !== 'requirements') {
      return NextResponse.json(
        {
          error: 'Project must be in requirements status to send messages',
          currentStatus: project.status,
        },
        { status: 400 }
      );
    }

    // Insert user message
    const [userMessage] = await db
      .insert(requirementsMessages)
      .values({
        projectId,
        userId,
        role: 'user',
        content,
      })
      .returning();

    console.log(`[API /requirements/messages] User message saved: ${userMessage.id}`);

    // Get previous messages for session continuity
    const previousDbMessages = await db
      .select({ role: requirementsMessages.role, content: requirementsMessages.content })
      .from(requirementsMessages)
      .where(eq(requirementsMessages.projectId, projectId))
      .orderBy(requirementsMessages.timestamp);

    // Convert to Anthropic format (excluding the message we just added - it will be sent as the new message)
    const previousMessages = convertToAnthropicMessages(
      previousDbMessages.slice(0, -1) // Exclude last message (the one we just inserted)
    );

    const isFirstRequest = previousMessages.length === 0;

    // Ensure requirements sandbox exists
    const sessionId = getRequirementsSessionId(projectId);
    const manager = getSandboxManager();

    let sandbox = await manager.getSandbox(sessionId);
    if (!sandbox || sandbox.status !== 'running') {
      console.log(
        `[API /requirements/messages] Creating requirements sandbox for project ${projectId}`
      );
      sandbox = await manager.createSandbox({
        projectId,
        sessionId,
        mode: 'requirements',
        orgId: project.orgId || undefined,
      });

      // Wait for the agent to be ready
      const agentReady = await manager.waitForAgent(sessionId);
      if (!agentReady) {
        throw new Error('Requirements sandbox agent failed to start');
      }
    }

    // Stream AI response from sandbox
    const client = new SandboxClient(sessionId);
    let assistantResponse = '';
    let docsCreated = false;
    let docsContent: string | undefined;

    console.log(`[API /requirements/messages] Streaming requirements response...`);

    for await (const event of client.streamRequirements(content, '/app/project', {
      previousMessages,
      isFirstRequest,
    })) {
      const eventData = event as { type?: string; data?: Record<string, unknown> };

      if (eventData.type === 'message' && eventData.data) {
        const text = (eventData.data as { text?: string }).text;
        if (text) {
          assistantResponse += text;
        }
      } else if (eventData.type === 'done' && eventData.data) {
        const doneData = eventData.data as {
          response?: string;
          docsCreated?: boolean;
          docsContent?: string;
          error?: string;
        };

        if (doneData.error) {
          throw new Error(doneData.error);
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
      `[API /requirements/messages] AI response received (${assistantResponse.length} chars)`
    );

    // Save assistant message to DB
    const [assistantMessage] = await db
      .insert(requirementsMessages)
      .values({
        projectId,
        userId,
        role: 'assistant',
        content: assistantResponse,
      })
      .returning();

    console.log(`[API /requirements/messages] Assistant message saved: ${assistantMessage.id}`);

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        timestamp: assistantMessage.timestamp,
      },
      docsCreated,
      docs: docsContent,
    });
  } catch (error) {
    console.error('[API /requirements/messages] POST Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

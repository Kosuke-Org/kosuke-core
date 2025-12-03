import { db } from '@/lib/db/drizzle';
import { buildJobs, chatSessions } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    id: string; // projectId
    sessionId: string;
  }>;
}

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/build-status
 *
 * Get the current build status for a session.
 * Used by client for polling during build execution.
 *
 * Response:
 * - null if no build exists
 * - BuildJob object with current status and progress
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId, sessionId } = await params;

    // Get the chat session DB ID
    const session = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)))
      .limit(1);

    if (session.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get the latest build job for this session
    const buildJob = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.chatSessionId, session[0].id))
      .orderBy(desc(buildJobs.createdAt))
      .limit(1);

    if (buildJob.length === 0) {
      return NextResponse.json({ build: null });
    }

    const job = buildJob[0];

    return NextResponse.json({
      build: {
        id: job.id,
        status: job.status,
        totalTickets: job.totalTickets,
        completedTickets: job.completedTickets,
        failedTickets: job.failedTickets,
        currentTicketId: job.currentTicketId,
        totalCost: job.totalCost,
        errorMessage: job.errorMessage,
        tickets: job.tickets,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    console.error('[BUILD-STATUS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


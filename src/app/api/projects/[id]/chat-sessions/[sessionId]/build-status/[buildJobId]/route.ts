import { db } from '@/lib/db/drizzle';
import { buildJobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    id: string; // projectId
    sessionId: string;
    buildJobId: string;
  }>;
}

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/build-status/[buildJobId]
 *
 * Get a specific build job by ID.
 * Used by BuildMessage component to fetch and poll individual builds.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { buildJobId } = await params;

    const [job] = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.id, buildJobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ build: null });
    }

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


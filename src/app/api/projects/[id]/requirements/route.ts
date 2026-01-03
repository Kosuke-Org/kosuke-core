import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects, requirementsMessages } from '@/lib/db/schema';

/**
 * GET /api/projects/[id]/requirements
 * Fetch the requirements document for a project
 * The document is aggregated from assistant messages in the requirements phase
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

    // Get the latest assistant message that contains the requirements document
    // The assistant consolidates requirements into a markdown document
    const messages = await db
      .select()
      .from(requirementsMessages)
      .where(eq(requirementsMessages.projectId, projectId))
      .orderBy(requirementsMessages.timestamp);

    // Extract the last assistant message content as the requirements doc
    // In a full implementation, this might be a dedicated field or AI-generated summary
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const latestAssistant = assistantMessages[assistantMessages.length - 1];

    // Build a simple requirements doc from assistant responses
    let docs = '';
    if (latestAssistant?.content) {
      docs = latestAssistant.content;
    } else if (assistantMessages.length > 0) {
      // Combine all assistant messages into a document
      docs = assistantMessages
        .map(m => m.content)
        .filter(Boolean)
        .join('\n\n---\n\n');
    }

    return NextResponse.json({
      docs,
      projectId: project.id,
      projectName: project.name,
      status: project.status,
    });
  } catch (error) {
    console.error('[API /requirements] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch requirements',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

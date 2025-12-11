import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { and, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/files
 * Get files for a project (uses main session sandbox)
 *
 * NOTE: This endpoint now uses the main session sandbox.
 * For session-specific files, use /api/projects/[id]/chat-sessions/[sessionId]/files
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get the main session
    const [mainSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)));

    if (!mainSession) {
      return NextResponse.json(
        {
          error: 'Main session not found',
          message: 'Project does not have a main session',
        },
        { status: 404 }
      );
    }

    // Check if sandbox is running
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, mainSession.sessionId);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Preview not running',
          message: 'Start the main preview to view files',
        },
        { status: 404 }
      );
    }

    // Get files from sandbox
    const client = new SandboxClient(projectId, mainSession.sessionId);

    try {
      const files = await client.listFiles();
      return NextResponse.json({ files });
    } catch (error) {
      console.error('Error fetching files from sandbox:', error);
      return NextResponse.json(
        {
          error: 'Failed to fetch files',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error getting project files:', error);
    return ApiErrorHandler.handle(error);
  }
}

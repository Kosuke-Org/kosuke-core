import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/files
 * Get files for a specific session via sandbox
 */
export async function GET(
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
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify session exists
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Check if sandbox is running
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(session.id);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Sandbox not running',
          message: 'Start a preview for this session to view files',
        },
        { status: 404 }
      );
    }

    // Get files from sandbox
    const client = new SandboxClient(session.id);

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
    console.error('Error getting session files:', error);
    return ApiErrorHandler.handle(error);
  }
}

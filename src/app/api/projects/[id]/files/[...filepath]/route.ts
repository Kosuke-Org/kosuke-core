import mime from 'mime-types';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { and, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/files/[...filepath]
 * Get the content of a file in a project (uses main session sandbox)
 *
 * NOTE: This endpoint now uses the main session sandbox.
 * For session-specific files, use /api/projects/[id]/chat-sessions/[sessionId]/files/[...filepath]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filepath: string[] }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, filepath } = await params;

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
    const sandbox = await sandboxManager.getSandbox(mainSession.id);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Preview not running',
          message: 'Start the main preview to view files',
        },
        { status: 404 }
      );
    }

    // Construct the relative file path
    const filePath = path.join(...filepath);

    // Get file from sandbox
    const client = new SandboxClient(mainSession.id);

    try {
      const fileContent = await client.readFile(filePath);

      // Determine the content type
      const contentType = mime.lookup(filePath) || 'application/octet-stream';

      // Return the file content
      return new NextResponse(fileContent, {
        headers: {
          'Content-Type': contentType,
        },
      });
    } catch (error) {
      console.error(`File not found or cannot be read: ${filePath}`, error);
      return ApiErrorHandler.notFound('File not found or cannot be read');
    }
  } catch (error: unknown) {
    console.error('Error getting file content:', error);
    return ApiErrorHandler.handle(error);
  }
}

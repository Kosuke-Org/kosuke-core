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
 * GET /api/projects/[id]/chat-sessions/[sessionId]/files/[...filepath]
 * Get the content of a file in a session via sandbox
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; filepath: string[] }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId, filepath } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify session exists
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Check if sandbox is running
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, sessionId);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Sandbox not running',
          message: 'Start a preview for this session to view files',
        },
        { status: 404 }
      );
    }

    // Construct the relative file path
    const filePath = path.join(...filepath);

    // Get file from sandbox
    const client = new SandboxClient(projectId, sessionId);

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

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/files/[...filepath]
 * Write content to a file in a session via sandbox
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; filepath: string[] }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId, filepath } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Verify session exists
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Check if sandbox is running
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, sessionId);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Sandbox not running',
          message: 'Start a preview for this session to write files',
        },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const content = body.content;

    if (content === undefined) {
      return ApiErrorHandler.badRequest('Content is required');
    }

    // Construct the relative file path
    const filePath = path.join(...filepath);

    // Write file to sandbox
    const client = new SandboxClient(projectId, sessionId);

    try {
      await client.writeFile(filePath, content);
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error(`Failed to write file: ${filePath}`, error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file',
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('Error writing file content:', error);
    return ApiErrorHandler.handle(error);
  }
}



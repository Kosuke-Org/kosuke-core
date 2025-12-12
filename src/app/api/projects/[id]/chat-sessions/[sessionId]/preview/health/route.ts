import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager } from '@/lib/sandbox';
import type { PreviewHealthResponse } from '@/lib/types';
import { and, eq } from 'drizzle-orm';

/**
 * Check if the preview service is responding via HTTP
 */
async function checkPreviewHealth(containerName: string, timeout = 2000): Promise<boolean> {
  // Use container name as hostname (Docker internal DNS)
  const url = `http://${containerName}:3000/`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // Consider any response (even errors) as "responding"
    return response.ok || response.status < 500;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/preview/health
 * Check if the sandbox container is running and the preview is responding
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
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Look up the session
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.sessionId, sessionId)));

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Update lastActivityAt to track preview usage for cleanup job
    await db
      .update(chatSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(chatSessions.id, session.id));

    // Check if sandbox container exists
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, sessionId);

    if (!sandbox) {
      const response: PreviewHealthResponse = {
        ok: false,
        running: false,
        isResponding: false,
        url: null,
      };
      return NextResponse.json(response);
    }

    // Container exists but not running
    if (sandbox.status !== 'running') {
      const response: PreviewHealthResponse = {
        ok: false,
        running: false,
        isResponding: false,
        url: sandbox.url,
      };
      return NextResponse.json(response);
    }

    // Container is running - check if preview is responding
    const isResponding = await checkPreviewHealth(sandbox.name);

    const response: PreviewHealthResponse = {
      ok: isResponding,
      running: true,
      isResponding,
      url: sandbox.url,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error checking preview health:', error);
    return ApiErrorHandler.handle(error);
  }
}

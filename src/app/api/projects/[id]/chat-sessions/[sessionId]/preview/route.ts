import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { getGitHubToken } from '@/lib/github/client';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager } from '@/lib/sandbox';
import { eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/preview
 * Get the preview URL for a project session
 * Automatically starts the sandbox if it's not running
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

    // Look up the session by ID or branchName
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Update lastActivityAt to track preview usage for cleanup job
    await db
      .update(chatSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(chatSessions.id, session.id));

    const sandboxManager = getSandboxManager();

    // Check if sandbox already exists
    const existingSandbox = await sandboxManager.getSandbox(session.id);

    if (existingSandbox && existingSandbox.status === 'running') {
      // Sandbox is running - return URL, frontend will poll health endpoint
      return NextResponse.json({
        success: true,
        previewUrl: existingSandbox.url,
        projectId,
        sessionId: session.id,
      });
    }

    // Sandbox not running - need to create/start it
    console.log('Sandbox is not running, starting...');

    // Get GitHub token
    const githubToken = await getGitHubToken(project.isImported, userId);

    if (!githubToken) {
      return ApiErrorHandler.badRequest('GitHub token not available');
    }

    // Determine mode: main session uses production, others use development
    const isMainSession = session.isDefault;
    const mode = isMainSession ? 'production' : 'development';

    // Build repo URL
    const repoUrl =
      project.githubRepoUrl ||
      `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

    // Create/start sandbox (database is created by the manager)
    const sandboxInfo = await sandboxManager.createSandbox({
      projectId,
      sessionId: session.id,
      branchName: session.branchName,
      repoUrl,
      githubToken,
      mode,
      orgId: project.orgId || undefined,
    });

    return NextResponse.json({
      success: true,
      previewUrl: sandboxInfo.url,
      projectId,
      sessionId: session.id,
    });
  } catch (error: unknown) {
    console.error('Error in preview GET:', error);
    return ApiErrorHandler.handle(error);
  }
}

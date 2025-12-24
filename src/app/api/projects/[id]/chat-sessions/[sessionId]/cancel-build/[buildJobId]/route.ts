import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs } from '@/lib/db/schema';
import { getGitHubToken } from '@/lib/github/client';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { cancelBuild } from '@/lib/queue';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { eq } from 'drizzle-orm';

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/cancel-build/[buildJobId]
 * Cancel a running or pending build job
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; buildJobId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId, buildJobId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get session info
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Verify build job exists and belongs to this session
    const [buildJob] = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.id, buildJobId))
      .limit(1);

    if (!buildJob) {
      return ApiErrorHandler.notFound('Build job not found');
    }

    if (buildJob.chatSessionId !== session.id) {
      return ApiErrorHandler.forbidden('Build job does not belong to this session');
    }

    // Check if build is already completed/failed/cancelled
    if (['completed', 'failed', 'cancelled'].includes(buildJob.status)) {
      return NextResponse.json({
        success: false,
        error: `Build is already ${buildJob.status}`,
      });
    }

    console.log(`🛑 Cancelling build job ${buildJobId} for session ${session.branchName}`);

    // Get GitHub token for git reset
    const githubToken = await getGitHubToken(project.isImported, userId);

    // Get sandbox client if sandbox is running
    let sandboxClient: SandboxClient | undefined;
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(session.id);

    if (sandbox && sandbox.status === 'running' && githubToken) {
      sandboxClient = new SandboxClient(session.id);
    }

    // Cancel the build
    const result = await cancelBuild({
      buildJobId,
      sandboxClient,
      githubToken: githubToken || undefined,
    });

    console.log(
      `✅ Build cancelled: ${result.cancelled} job(s) removed${result.resetCommit ? `, reverted to ${result.resetCommit.substring(0, 8)}` : ''}`
    );

    return NextResponse.json({
      success: true,
      data: {
        cancelled: result.cancelled,
        resetCommit: result.resetCommit,
        message: result.resetCommit
          ? `Build cancelled and code reverted to ${result.resetCommit.slice(0, 7)}`
          : 'Build cancelled',
      },
    });
  } catch (error) {
    console.error('Error cancelling build:', error);
    return ApiErrorHandler.handle(error);
  }
}

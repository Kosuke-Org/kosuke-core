import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { submitQueue } from '@/lib/queue/queues/submit';
import { getSandboxManager } from '@/lib/sandbox';
import { eq } from 'drizzle-orm';

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/submit-build/[buildJobId]
 * Submit a completed build for review, commit, and PR creation
 *
 * Workflow:
 * 1. Validates build is in 'completed' status
 * 2. Sets submitStatus to 'pending'
 * 3. Enqueues submit job to BullMQ
 * 4. Worker calls kosuke-cli /api/submit (review → commit → PR)
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

    // Get the build job
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

    // Only allow submitting ready builds
    if (buildJob.status !== 'completed') {
      return ApiErrorHandler.badRequest(
        `Can only submit ready builds. Current status: ${buildJob.status}`
      );
    }

    // Check if already submitted or in progress
    if (buildJob.submitStatus) {
      if (buildJob.submitStatus === 'done') {
        return ApiErrorHandler.badRequest('Build has already been submitted');
      }
      if (buildJob.submitStatus !== 'failed') {
        return ApiErrorHandler.badRequest(
          `Submit already in progress. Current status: ${buildJob.submitStatus}`
        );
      }
      // submitStatus === 'failed' - allow retry
    }

    console.log(`📤 Submitting build job ${buildJobId} for session ${session.branchName}`);

    // Get GitHub token
    const githubToken = await getProjectGitHubToken(project);

    if (!githubToken) {
      return ApiErrorHandler.unauthorized('GitHub token not available');
    }

    // Get sandbox status
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(session.id);

    if (!sandbox || sandbox.status !== 'running') {
      return ApiErrorHandler.badRequest('Sandbox is not running');
    }

    // Update build job submit status to pending
    await db.update(buildJobs).set({ submitStatus: 'pending' }).where(eq(buildJobs.id, buildJobId));

    // Parse optional body for PR title and user email
    let title: string | undefined;
    let userEmail: string | undefined;
    try {
      const body = await request.json();
      title = body?.title;
      userEmail = body?.userEmail;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Enqueue submit job
    await submitQueue.add('submit', {
      buildJobId,
      chatSessionId: session.id,
      projectId,
      sessionId: session.id,
      cwd: '/app/project',
      ticketsPath: buildJob.ticketsPath!,
      githubToken,
      baseBranch: project.defaultBranch || 'main',
      title: title || `feat: ${session.branchName}`,
      userEmail,
      orgId: project.orgId ?? undefined,
    });

    console.log(`🚀 Enqueued submit job for build ${buildJobId}`);

    return NextResponse.json({
      success: true,
      data: {
        buildJobId,
        submitStatus: 'pending',
        message: 'Submit job enqueued. Check build status for updates.',
      },
    });
  } catch (error) {
    console.error('Error submitting build:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/submit-build/[buildJobId]
 * Get submit status for a build
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; buildJobId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId, buildJobId } = await params;

    // Verify user has access to project
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get session info
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Get the build job
    const [buildJob] = await db
      .select({
        id: buildJobs.id,
        status: buildJobs.status,
        submitStatus: buildJobs.submitStatus,
      })
      .from(buildJobs)
      .where(eq(buildJobs.id, buildJobId))
      .limit(1);

    if (!buildJob) {
      return ApiErrorHandler.notFound('Build job not found');
    }

    if (buildJob.id !== buildJobId) {
      return ApiErrorHandler.forbidden('Build job does not belong to this session');
    }

    // Construct PR URL from session's pullRequestNumber if available
    const prUrl = session.pullRequestNumber
      ? `https://github.com/${project.githubOwner}/${project.githubRepoName}/pull/${session.pullRequestNumber}`
      : null;

    return NextResponse.json({
      success: true,
      data: {
        buildJobId: buildJob.id,
        buildStatus: buildJob.status,
        submitStatus: buildJob.submitStatus,
        prUrl,
      },
    });
  } catch (error) {
    console.error('Error getting submit status:', error);
    return ApiErrorHandler.handle(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs, chatMessages, tasks } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { getBuildQueue } from '@/lib/queue/queues/build';
import { getSandboxConfig, getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { getSandboxDatabaseUrl } from '@/lib/sandbox/database';
import { eq } from 'drizzle-orm';

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/restart-build/[buildJobId]
 * Restart a failed or cancelled build by reverting git, resetting tickets, and starting a new build
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

    // Get the failed build job
    const [failedBuild] = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.id, buildJobId))
      .limit(1);

    if (!failedBuild) {
      return ApiErrorHandler.notFound('Build job not found');
    }

    if (failedBuild.chatSessionId !== session.id) {
      return ApiErrorHandler.forbidden('Build job does not belong to this session');
    }

    // Only allow restarting failed or cancelled builds
    if (failedBuild.status !== 'failed' && failedBuild.status !== 'cancelled') {
      return ApiErrorHandler.badRequest(
        `Can only restart failed or cancelled builds. Current status: ${failedBuild.status}`
      );
    }

    console.log(
      `🔄 Restarting ${failedBuild.status} build job ${buildJobId} for session ${session.branchName}`
    );

    // Get GitHub token using project's App installation
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return ApiErrorHandler.badRequest('GitHub token not available for this project');
    }

    // Get sandbox client
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(session.id);

    if (!sandbox || sandbox.status !== 'running') {
      return ApiErrorHandler.badRequest('Sandbox is not running');
    }

    const sandboxClient = new SandboxClient(session.id);

    // 1. Revert git to startCommit if available
    let resetCommit: string | null = null;
    if (failedBuild.startCommit) {
      try {
        console.log(`🔄 Reverting to commit ${failedBuild.startCommit.substring(0, 8)}`);
        const result = await sandboxClient.revert(failedBuild.startCommit, githubToken);
        if (result.success) {
          resetCommit = failedBuild.startCommit;
          console.log(`✅ Git reset and force push successful`);
        } else {
          console.warn(`⚠️ Git reset failed: ${result.error}`);
          return ApiErrorHandler.badRequest(`Git reset failed: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Git reset error:`, error);
        return ApiErrorHandler.badRequest('Git reset failed');
      }
    }

    // 2. Get original tasks for the failed build to recreate them
    const originalTasks = await db.select().from(tasks).where(eq(tasks.buildJobId, buildJobId));

    if (originalTasks.length === 0) {
      return ApiErrorHandler.badRequest('No tasks found for this build');
    }

    // 3. Generate timestamp-based tickets path (same format as plan command)
    // Format: tickets/YYYY-MM-DD-HH-mm-ss.tickets.json
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, '-')
      .replace(/\.\d{3}Z$/, '');
    const ticketsFileName = `${timestamp}.tickets.json`;
    const ticketsRelativePath = `tickets/${ticketsFileName}`;
    const ticketsAbsolutePath = `/app/project/${ticketsRelativePath}`;

    // 4. Recreate tickets file from database tasks
    // (After git revert, tickets file doesn't exist since it was created during plan phase)
    try {
      const ticketsData = {
        tickets: originalTasks
          .sort((a, b) => a.order - b.order)
          .map(task => ({
            id: task.externalId,
            title: task.title,
            description: task.description,
            type: task.type || 'feature',
            category: task.category || 'general',
            estimatedEffort: task.estimatedEffort || 1,
            status: 'Todo',
          })),
      };

      await sandboxClient.writeFile(ticketsAbsolutePath, JSON.stringify(ticketsData, null, 2));
      console.log(`✅ Created ${ticketsRelativePath} with ${ticketsData.tickets.length} tickets`);
    } catch (error) {
      console.error(`❌ Failed to create tickets file:`, error);
      return ApiErrorHandler.badRequest('Failed to create tickets file');
    }

    // 5. Create new build job
    const sandboxConfig = getSandboxConfig();
    const testUrl = `http://localhost:${sandboxConfig.bunPort}`;

    const [newBuildJob] = await db
      .insert(buildJobs)
      .values({
        projectId,
        chatSessionId: session.id,
        claudeSessionId: failedBuild.claudeSessionId, // Keep audit trail
        status: 'pending',
      })
      .returning();

    console.log(`✅ Created new build job ${newBuildJob.id}`);

    // 6. Create new tasks for the new build job (copy from original)
    await db.insert(tasks).values(
      originalTasks.map((task, index) => ({
        buildJobId: newBuildJob.id,
        externalId: task.externalId,
        title: task.title,
        description: task.description,
        type: task.type,
        category: task.category,
        estimatedEffort: task.estimatedEffort,
        order: index,
        status: 'todo' as const,
      }))
    );

    console.log(`✅ Created ${originalTasks.length} tasks for new build`);

    // 7. Create assistant message for the restarted build (empty content, build component shows)
    await db.insert(chatMessages).values({
      projectId,
      chatSessionId: session.id,
      userId,
      role: 'assistant',
      content: '',
      metadata: { buildJobId: newBuildJob.id },
    });

    console.log(`✅ Created chat message for build ${newBuildJob.id}`);

    // 8. Enqueue the new build
    await getBuildQueue().add('build', {
      buildJobId: newBuildJob.id,
      chatSessionId: session.id,
      projectId,
      sessionId: session.id,
      ticketsPath: ticketsRelativePath,
      cwd: '/app/project',
      dbUrl: getSandboxDatabaseUrl(session.id),
      githubToken,
      enableTest: sandboxConfig.test,
      testUrl,
      userId,
    });

    console.log(`🚀 Enqueued new build job ${newBuildJob.id}`);

    return NextResponse.json({
      success: true,
      data: {
        originalBuildJobId: buildJobId,
        newBuildJobId: newBuildJob.id,
        resetCommit,
        tasksCount: originalTasks.length,
        message: `Build restarted${resetCommit ? ` from commit ${resetCommit.slice(0, 7)}` : ''}`,
      },
    });
  } catch (error) {
    console.error('Error restarting build:', error);
    return ApiErrorHandler.handle(error);
  }
}

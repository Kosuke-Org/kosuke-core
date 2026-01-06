import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs, chatSessions, projects } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { desc, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/latest-build
 * Get the latest build job status for a chat session
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, sessionId } = await params;

    // Verify project access
    const hasAccess = await verifyProjectAccess(userId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get the latest build job for this session with project info for PR URL
    const latestBuild = await db
      .select({
        buildJob: buildJobs,
        pullRequestNumber: chatSessions.pullRequestNumber,
        githubOwner: projects.githubOwner,
        githubRepoName: projects.githubRepoName,
      })
      .from(buildJobs)
      .innerJoin(chatSessions, eq(buildJobs.chatSessionId, chatSessions.id))
      .innerJoin(projects, eq(chatSessions.projectId, projects.id))
      .where(eq(buildJobs.chatSessionId, sessionId))
      .orderBy(desc(buildJobs.createdAt))
      .limit(1);

    // Construct PR URL from session's pullRequestNumber if available
    const prUrl =
      latestBuild[0]?.pullRequestNumber &&
      latestBuild[0]?.githubOwner &&
      latestBuild[0]?.githubRepoName
        ? `https://github.com/${latestBuild[0].githubOwner}/${latestBuild[0].githubRepoName}/pull/${latestBuild[0].pullRequestNumber}`
        : null;

    return NextResponse.json({
      hasBuild: latestBuild.length > 0,
      status: latestBuild[0]?.buildJob.status ?? null,
      buildJobId: latestBuild[0]?.buildJob.id ?? null,
      submitStatus: latestBuild[0]?.buildJob.submitStatus ?? null,
      prUrl,
    });
  } catch (error) {
    console.error('Error fetching latest build:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

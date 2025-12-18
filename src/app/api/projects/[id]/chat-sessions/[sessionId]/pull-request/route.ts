import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { buildJobs, chatSessions } from '@/lib/db/schema';
import { getOctokit } from '@/lib/github/client';
import { findChatSession, verifyProjectAccess } from '@/lib/projects';
import { desc, eq } from 'drizzle-orm';

// Schema for creating pull request
const createPullRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  target_branch: z.string().optional(),
});

/**
 * POST /api/projects/[id]/chat-sessions/[sessionId]/pull-request
 * Create pull request from chat session branch
 */
export async function POST(
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
      return ApiErrorHandler.forbidden();
    }

    // Verify GitHub repository is connected
    if (!project.githubOwner || !project.githubRepoName) {
      return ApiErrorHandler.badRequest('Project is not connected to a GitHub repository');
    }

    // Get chat session by ID or branchName
    const session = await findChatSession(projectId, sessionId);

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Check for completed build before allowing PR creation
    const latestBuild = await db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.chatSessionId, session.id))
      .orderBy(desc(buildJobs.createdAt))
      .limit(1);

    if (!latestBuild[0] || latestBuild[0].status !== 'completed') {
      return ApiErrorHandler.badRequest('Cannot create PR without a completed build');
    }

    // Parse request body
    const body = await request.json();
    const parseResult = createPullRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const { title, description, target_branch } = parseResult.data;

    // Use the session's branchName directly
    const sourceBranch = session.branchName;
    const targetBranch = target_branch || project.defaultBranch || 'main';
    const prTitle = title || session.title;
    const prDescription =
      description ||
      `Automated changes from Kosuke chat session: ${session.title}\n\nBranch: ${sourceBranch}`;

    try {
      // Get GitHub client based on project ownership
      const github = await getOctokit(project.isImported, userId);

      // Check if source branch exists
      try {
        await github.rest.repos.getBranch({
          owner: project.githubOwner,
          repo: project.githubRepoName,
          branch: sourceBranch,
        });
      } catch {
        return ApiErrorHandler.badRequest(
          `Source branch '${sourceBranch}' not found. Make sure the chat session has made changes and committed them.`
        );
      }

      // Check if target branch exists
      try {
        await github.rest.repos.getBranch({
          owner: project.githubOwner,
          repo: project.githubRepoName,
          branch: targetBranch,
        });
      } catch {
        return ApiErrorHandler.badRequest(`Target branch '${targetBranch}' not found`);
      }

      // Create actual PR via GitHub API
      const { data: pr } = await github.rest.pulls.create({
        owner: project.githubOwner,
        repo: project.githubRepoName,
        title: prTitle,
        body: prDescription,
        head: sourceBranch,
        base: targetBranch,
      });

      // Store PR number in session
      await db
        .update(chatSessions)
        .set({ pullRequestNumber: pr.number })
        .where(eq(chatSessions.id, session.id));

      return NextResponse.json({
        pull_request_url: pr.html_url,
        pull_request_number: pr.number,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: prTitle,
        success: true,
      });
    } catch (error: unknown) {
      console.error('Error creating pull request:', error);
      // Handle GitHub-specific errors
      if (error instanceof Error && error.message.includes('A pull request already exists')) {
        return ApiErrorHandler.badRequest(
          'A pull request already exists for this branch. Please check GitHub for the existing PR.'
        );
      }
      return ApiErrorHandler.handle(error);
    }
  } catch (error) {
    console.error('Error in pull request creation:', error);
    return ApiErrorHandler.handle(error);
  }
}

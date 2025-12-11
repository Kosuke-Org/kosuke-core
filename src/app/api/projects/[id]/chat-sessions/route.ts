import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { getOctokit } from '@/lib/github/client';
import { verifyProjectAccess } from '@/lib/projects';
import type { Octokit } from '@octokit/rest';
import { and, desc, eq } from 'drizzle-orm';

// Schema for creating a chat session
const createChatSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().optional(),
});

// Types for merge status
interface BranchMergeStatus {
  isMerged: boolean;
  mergedAt: string | null;
  mergedBy: string | null;
  mergeCommitSha: string | null;
  pullRequestNumber: number | null;
}

interface PullRequestWithMergedBy {
  merged_by?: {
    login: string;
  } | null;
  merge_commit_sha: string | null;
}

/**
 * Check if a branch has been merged using GitHub API via Octokit
 */
async function checkBranchMergeStatus(
  github: Octokit,
  owner: string,
  repo: string,
  branchName: string
): Promise<BranchMergeStatus> {
  try {
    // Search for pull requests from this branch (all states)
    const { data: pullRequests } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branchName}`,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 10, // Limit to most recent 10 PRs
    });

    // Find the most recent merged PR from this branch
    const mergedPR = pullRequests.find(pr => pr.merged_at !== null);

    if (mergedPR) {
      // Get detailed PR info to access merged_by
      const { data: prDetails } = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: mergedPR.number,
      });

      return {
        isMerged: true,
        mergedAt: mergedPR.merged_at,
        mergedBy: (prDetails as PullRequestWithMergedBy).merged_by?.login || null,
        mergeCommitSha: prDetails.merge_commit_sha,
        pullRequestNumber: mergedPR.number,
      };
    }

    return {
      isMerged: false,
      mergedAt: null,
      mergedBy: null,
      mergeCommitSha: null,
      pullRequestNumber: null,
    };
  } catch (error) {
    console.error('Error checking merged pull requests:', error);
    return {
      isMerged: false,
      mergedAt: null,
      mergedBy: null,
      mergeCommitSha: null,
      pullRequestNumber: null,
    };
  }
}

/**
 * GET /api/projects/[id]/chat-sessions
 * List all chat sessions for a project
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get all chat sessions for the project (excluding the default "main" session used for tracking)
    let sessions = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, false)))
      .orderBy(desc(chatSessions.lastActivityAt));

    // Check and update merge status for sessions with GitHub branches
    if (project.githubOwner && project.githubRepoName) {
      try {
        const github = await getOctokit(project.isImported, userId);

        // Check merge status for sessions that have branches but no merge info yet
        const sessionsToUpdate = sessions.filter(
          session => !!session.sessionId && !session.branchMergedAt // Only check if not already marked as merged
        );

        // Process sessions in parallel but limit concurrency
        const updatePromises = sessionsToUpdate.map(async session => {
          try {
            const mergeStatus = await checkBranchMergeStatus(
              github,
              project.githubOwner!,
              project.githubRepoName!,
              session.sessionId
            );

            if (mergeStatus.isMerged) {
              // Update session in database with merge information
              const [updatedSession] = await db
                .update(chatSessions)
                .set({
                  branchMergedAt: mergeStatus.mergedAt ? new Date(mergeStatus.mergedAt) : null,
                  branchMergedBy: mergeStatus.mergedBy,
                  mergeCommitSha: mergeStatus.mergeCommitSha,
                  pullRequestNumber: mergeStatus.pullRequestNumber,
                  updatedAt: new Date(),
                })
                .where(eq(chatSessions.id, session.id))
                .returning();

              return updatedSession;
            }
            return session;
          } catch (error) {
            console.error(`Error checking merge status for session ${session.id}:`, error);
            return session; // Return original session if merge check fails
          }
        });

        // Wait for all updates to complete
        const updatedSessions = await Promise.all(updatePromises);

        // Replace sessions with updated versions
        sessions = sessions.map(session => {
          const updated = updatedSessions.find(u => u?.id === session.id);
          return updated || session;
        });
      } catch (error) {
        console.error('Error checking merge status for sessions:', error);
        // Continue without merge status updates if GitHub integration fails
      }
    }

    return NextResponse.json({
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * POST /api/projects/[id]/chat-sessions
 * Create a new chat session
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Parse request body
    const body = await request.json();
    const parseResult = createChatSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const { title, description } = parseResult.data;

    // Use random session id of 5 letters
    const sessionId = Math.random().toString(36).slice(2, 8);

    // Create chat session
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        projectId,
        userId,
        title,
        description,
        sessionId,
        status: 'active',
        messageCount: 0,
        isDefault: false,
      })
      .returning();

    return NextResponse.json({
      session: newSession,
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    return ApiErrorHandler.handle(error);
  }
}

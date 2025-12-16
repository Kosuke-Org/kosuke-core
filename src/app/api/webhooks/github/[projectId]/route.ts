/**
 * GitHub Webhook Handler
 * POST /api/webhooks/github/[projectId]
 *
 * Handles push and pull_request events from GitHub:
 * - Push events: Update sandbox containers and chat session updatedAt
 * - Pull request events: Create/update chat sessions based on PR lifecycle
 */

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { getGitHubToken } from '@/lib/github/client';
import {
  verifyWebhookSignature,
  type GitHubPullRequestPayload,
  type GitHubPushPayload,
} from '@/lib/github/webhooks';
import { getSandboxManager } from '@/lib/sandbox';

/**
 * Get the sandbox commit email from environment
 */
function getSandboxCommitEmail(): string {
  const sandboxEmail = process.env.SANDBOX_GIT_EMAIL;
  if (!sandboxEmail) {
    throw new Error('SANDBOX_GIT_EMAIL environment variable is required');
  }
  return sandboxEmail;
}

/**
 * Check if all commits in the push are from the Kosuke sandbox
 */
function isSandboxPush(commits: GitHubPushPayload['commits']): boolean {
  if (commits.length === 0) return false;
  const sandboxEmail = getSandboxCommitEmail();
  return commits.every(commit => commit.author.email === sandboxEmail);
}

/**
 * Extract branch name from git ref (e.g., "refs/heads/main" -> "main")
 */
function getBranchFromRef(ref: string): string {
  return ref.replace('refs/heads/', '');
}

/**
 * Handle push events - update sandbox and chat session updatedAt
 */
async function handlePushEvent(
  projectId: string,
  payload: GitHubPushPayload,
  project: typeof projects.$inferSelect
): Promise<{ success: boolean; message: string; sandboxRestarted?: boolean }> {
  // Ignore pushes made by the Kosuke sandbox to avoid restart loops
  if (isSandboxPush(payload.commits)) {
    console.log(
      `ℹ️ Ignoring sandbox push for project ${projectId} as it's from the Kosuke sandbox`
    );
    return { success: true, message: 'Ignored - sandbox commit' };
  }

  if (!payload.ref) {
    console.log(`ℹ️ Ignoring push for project ${projectId} as it's not a push to a branch`);
    return { success: true, message: 'Ignored - not a push to a branch' };
  }

  const branchName = getBranchFromRef(payload.ref);
  console.log(`📥 Received push to ${branchName} for project ${projectId}`);
  console.log(`   Commits: ${payload.commits.length}, Pusher: ${payload.pusher.name}`);

  // Update chat session updatedAt for this branch
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.branchName, branchName)));

  if (session) {
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(chatSessions.id, session.id));
    console.log(`✅ Updated chat session ${session.id} for branch ${branchName}`);

    // Check if sandbox for this session is running and update it
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(session.id);

    if (sandbox && sandbox.status === 'running') {
      // Get GitHub token based on project ownership
      const githubToken = project.createdBy
        ? await getGitHubToken(project.isImported, project.createdBy)
        : null;

      if (!githubToken) {
        console.warn(`⚠️ No GitHub token available for project ${projectId}`);
        return { success: false, message: 'No GitHub token available' };
      }

      // Update sandbox with latest code
      console.log(`🔄 Updating sandbox for session ${session.id} in project ${projectId}`);
      await sandboxManager.updateSandbox(session.id, {
        branch: branchName,
        githubToken,
      });
      console.log(`✅ Sandbox updated for project ${projectId}`);
    } else {
      console.log(`ℹ️ Sandbox not running for session ${session.id}, skipping update`);
    }
  }

  const restarted = !!session;

  // Update last sync timestamp (only for main branch)
  if (branchName === 'main' || branchName === project.defaultBranch) {
    await db.update(projects).set({ lastGithubSync: new Date() }).where(eq(projects.id, projectId));
  }

  return {
    success: true,
    message: 'Push event processed successfully',
    sandboxRestarted: restarted,
  };
}

/**
 * Handle pull_request events - create/update chat sessions
 */
async function handlePullRequestEvent(
  projectId: string,
  payload: GitHubPullRequestPayload
): Promise<{ success: boolean; message: string; sessionId?: string }> {
  const { action, pull_request: pr } = payload;
  const branchName = pr.head.ref;

  console.log(
    `📥 Received pull_request ${action} for branch ${branchName} in project ${projectId}`
  );

  // Find existing session for this branch
  const [existingSession] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.branchName, branchName)));

  switch (action) {
    case 'opened': {
      // Create new chat session if it doesn't exist
      if (existingSession) {
        // Session already exists, update PR number if not set
        if (!existingSession.pullRequestNumber) {
          await db
            .update(chatSessions)
            .set({
              pullRequestNumber: pr.number,
              title: pr.title,
              updatedAt: new Date(),
            })
            .where(eq(chatSessions.id, existingSession.id));
          console.log(`✅ Updated existing session ${existingSession.id} with PR #${pr.number}`);
        }
        return { success: true, message: 'Session already exists', sessionId: existingSession.id };
      }

      // Create new session
      const [newSession] = await db
        .insert(chatSessions)
        .values({
          projectId,
          userId: null, // External PR, no user
          title: pr.title,
          branchName,
          status: 'active',
          pullRequestNumber: pr.number,
          messageCount: 0,
          isDefault: false,
        })
        .returning();

      console.log(`✅ Created new chat session ${newSession.id} for PR #${pr.number}`);
      return { success: true, message: 'Session created', sessionId: newSession.id };
    }

    case 'closed': {
      if (!existingSession) {
        console.log(`ℹ️ No session found for branch ${branchName}, nothing to update`);
        return { success: true, message: 'No session found' };
      }

      if (pr.merged) {
        // PR was merged - update status to completed
        await db
          .update(chatSessions)
          .set({
            status: 'completed',
            branchMergedAt: pr.merged_at ? new Date(pr.merged_at) : new Date(),
            branchMergedBy: pr.merged_by?.login || null,
            mergeCommitSha: pr.merge_commit_sha,
            updatedAt: new Date(),
          })
          .where(eq(chatSessions.id, existingSession.id));
        console.log(`✅ Marked session ${existingSession.id} as completed (PR merged)`);
        return {
          success: true,
          message: 'Session marked as completed',
          sessionId: existingSession.id,
        };
      } else {
        // PR was closed without merge - update status to archived
        await db
          .update(chatSessions)
          .set({
            status: 'archived',
            updatedAt: new Date(),
          })
          .where(eq(chatSessions.id, existingSession.id));
        console.log(`✅ Marked session ${existingSession.id} as archived (PR closed)`);
        return {
          success: true,
          message: 'Session marked as archived',
          sessionId: existingSession.id,
        };
      }
    }

    case 'reopened': {
      if (!existingSession) {
        console.log(`ℹ️ No session found for branch ${branchName}, nothing to update`);
        return { success: true, message: 'No session found' };
      }

      // PR was reopened - update status back to active
      await db
        .update(chatSessions)
        .set({
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, existingSession.id));
      console.log(`✅ Marked session ${existingSession.id} as active (PR reopened)`);
      return { success: true, message: 'Session marked as active', sessionId: existingSession.id };
    }

    case 'edited': {
      if (!existingSession) {
        console.log(`ℹ️ No session found for branch ${branchName}, nothing to update`);
        return { success: true, message: 'No session found' };
      }

      // PR title was edited - update session title
      await db
        .update(chatSessions)
        .set({
          title: pr.title,
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, existingSession.id));
      console.log(`✅ Updated session ${existingSession.id} title to "${pr.title}"`);
      return { success: true, message: 'Session title updated', sessionId: existingSession.id };
    }

    case 'synchronize': {
      // New commits pushed to PR branch - update updatedAt
      if (!existingSession) {
        console.log(`ℹ️ No session found for branch ${branchName}, nothing to update`);
        return { success: true, message: 'No session found' };
      }

      await db
        .update(chatSessions)
        .set({
          updatedAt: new Date(),
          lastActivityAt: new Date(),
        })
        .where(eq(chatSessions.id, existingSession.id));
      console.log(`✅ Updated session ${existingSession.id} timestamps`);
      return {
        success: true,
        message: 'Session timestamps updated',
        sessionId: existingSession.id,
      };
    }

    default:
      console.log(`ℹ️ Ignoring pull_request action: ${action}`);
      return { success: true, message: `Ignored action: ${action}` };
  }
}

/**
 * POST /api/webhooks/github/[projectId]
 * Handle GitHub webhook events (push and pull_request)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Get event type from header
    const eventType = request.headers.get('x-github-event');
    console.log(`📨 Received GitHub ${eventType} event for project ${projectId}`);

    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.warn(`Webhook request missing signature for project ${projectId}`);
      return NextResponse.json({ message: 'Missing signature' });
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn(`Invalid webhook signature for project ${projectId}`);
      return NextResponse.json({ message: 'Invalid signature' });
    }

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`Project ${projectId} not found for webhook`);
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Route to appropriate handler based on event type
    if (eventType === 'push') {
      const payload: GitHubPushPayload = JSON.parse(rawBody);
      const result = await handlePushEvent(projectId, payload, project);
      return NextResponse.json(result);
    }

    if (eventType === 'pull_request') {
      const payload: GitHubPullRequestPayload = JSON.parse(rawBody);
      const result = await handlePullRequestEvent(projectId, payload);
      return NextResponse.json(result);
    }

    // Ignore other event types (e.g., ping)
    console.log(`ℹ️ Ignoring event type: ${eventType}`);
    return NextResponse.json({ message: `Ignored event type: ${eventType}` });
  } catch (error) {
    console.error(`Error processing webhook for project ${projectId}:`, error);
    return NextResponse.json({ message: 'Internal server error' });
  }
}

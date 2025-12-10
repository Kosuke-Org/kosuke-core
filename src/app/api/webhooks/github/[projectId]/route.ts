/**
 * GitHub Webhook Handler
 * POST /api/webhooks/github/[projectId]
 *
 * Handles push events from GitHub to restart sandbox containers.
 * The sandbox entrypoint handles git sync on restart.
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { verifyWebhookSignature, type GitHubPushPayload } from '@/lib/github/webhooks';
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
 * Get sessionId from branch name
 * - "main" -> "main"
 * - "kosuke/chat-abc123" -> "abc123"
 */
function getSessionIdFromBranch(branch: string): string | null {
  if (branch === 'main') {
    return 'main';
  }

  const branchPrefix = process.env.SESSION_BRANCH_PREFIX;
  if (branchPrefix && branch.startsWith(branchPrefix)) {
    return branch.slice(branchPrefix.length);
  }

  // Unknown branch format - no matching sandbox
  return null;
}

/**
 * POST /api/webhooks/github/[projectId]
 * Handle GitHub webhook events
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

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

    // Parse payload
    const payload: GitHubPushPayload = JSON.parse(rawBody);
    if (!payload.ref) {
      console.log(`Ignoring webhook for project ${projectId} as it's not a push to a branch`);
      return NextResponse.json({ message: 'Ignored - not a push to a branch' });
    }

    // Ignore pushes made by the Kosuke sandbox to avoid restart loops
    if (isSandboxPush(payload.commits)) {
      console.log(
        `ℹ️ Ignoring sandbox push for project ${projectId} as it's from the Kosuke sandbox`
      );
      return NextResponse.json({ message: 'Ignored - sandbox commit' });
    }

    const branch = getBranchFromRef(payload.ref);
    const sessionId = getSessionIdFromBranch(branch);

    console.log(`📥 Received push to ${branch} for project ${projectId}`);
    console.log(`   Commits: ${payload.commits.length}, Pusher: ${payload.pusher.name}`);

    // If we can't map branch to a sessionId, ignore
    if (!sessionId) {
      console.log(`ℹ️ No sandbox mapped to branch ${branch}, ignoring`);
      return NextResponse.json({ message: 'Ignored - no sandbox for this branch' });
    }

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`Project ${projectId} not found for webhook`);
      return NextResponse.json({ message: 'Project not found' });
    }

    // Check if sandbox for this branch is running and restart it
    // The entrypoint.sh handles git fetch/reset on container restart
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, sessionId);

    let restarted = false;

    if (sandbox && sandbox.status === 'running') {
      console.log(`🔄 Restarting sandbox (session: ${sessionId}) for project ${projectId}`);
      await sandboxManager.restartSandbox(projectId, sessionId);
      restarted = true;
      console.log(`✅ Sandbox restarted for project ${projectId}`);
    } else {
      console.log(`ℹ️ Sandbox not running for session ${sessionId}, skipping restart`);
    }

    // Update last sync timestamp (only for main branch)
    if (sessionId === 'main') {
      await db
        .update(projects)
        .set({ lastGithubSync: new Date() })
        .where(eq(projects.id, projectId));
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      sandboxRestarted: restarted,
    });
  } catch (error) {
    console.error(`Error processing webhook for project ${projectId}:`, error);
    return NextResponse.json({ message: 'Internal server error' });
  }
}

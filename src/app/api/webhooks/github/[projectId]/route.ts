/**
 * GitHub Webhook Handler
 * POST /api/webhooks/github/[projectId]
 *
 * Handles push events from GitHub to sync main branch and restart preview containers
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getKosukeGitHubToken, getUserGitHubToken } from '@/lib/github/client';
import { GitOperations } from '@/lib/github/git-operations';
import {
  isPushToMain,
  verifyWebhookSignature,
  type GitHubPushPayload,
} from '@/lib/github/webhooks';
import { getPreviewService } from '@/lib/previews';
import { sessionManager } from '@/lib/sessions';

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
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn(`Invalid webhook signature for project ${projectId}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    const payload: GitHubPushPayload = JSON.parse(rawBody);

    // Only process pushes to main branch
    if (!isPushToMain(payload)) {
      console.log(`Ignoring push to ${payload.ref} for project ${projectId}`);
      return NextResponse.json({ message: 'Ignored - not main branch' });
    }

    console.log(`📥 Received push to main for project ${projectId}`);
    console.log(`   Commits: ${payload.commits.length}, Pusher: ${payload.pusher.name}`);

    // Get project from database
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`Project ${projectId} not found for webhook`);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get GitHub token based on repo type
    const kosukeOrg = process.env.NEXT_PUBLIC_GITHUB_WORKSPACE;
    const isKosukeRepo = project.githubOwner === kosukeOrg;

    let githubToken: string;
    if (isKosukeRepo) {
      githubToken = await getKosukeGitHubToken();
    } else {
      // For imported repos, we need the creator's token
      if (!project.createdBy) {
        console.error(`No creator found for imported project ${projectId}`);
        return NextResponse.json({ error: 'Cannot authenticate' }, { status: 500 });
      }
      const userToken = await getUserGitHubToken(project.createdBy);
      if (!userToken) {
        console.error(`No GitHub token found for user ${project.createdBy}`);
        return NextResponse.json({ error: 'Cannot authenticate' }, { status: 500 });
      }
      githubToken = userToken;
    }

    // Pull changes for the main session
    const sessionPath = sessionManager.getSessionPath(projectId, 'main');
    const gitOps = new GitOperations();

    const pullSuccess = await gitOps.pullChanges(sessionPath, 'main', githubToken);

    if (!pullSuccess) {
      console.error(`Failed to pull changes for project ${projectId}`);
      return NextResponse.json({ error: 'Failed to pull changes' }, { status: 500 });
    }

    // Check if preview is running and restart it
    const previewService = getPreviewService();
    const status = await previewService.getPreviewStatus(projectId, 'main');

    if (status.running) {
      console.log(`🔄 Restarting preview for project ${projectId} after push to main`);
      await previewService.restartPreview(projectId, 'main');
      console.log(`✅ Preview restarted for project ${projectId}`);
    } else {
      console.log(`ℹ️ Preview not running for project ${projectId}, skipping restart`);
    }

    // Update last sync timestamp
    await db.update(projects).set({ lastGithubSync: new Date() }).where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      pulled: pullSuccess,
      previewRestarted: status.running,
    });
  } catch (error) {
    console.error(`Error processing webhook for project ${projectId}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

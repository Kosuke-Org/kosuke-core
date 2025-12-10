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
import {
  isPushToMain,
  verifyWebhookSignature,
  type GitHubPushPayload,
} from '@/lib/github/webhooks';
import { getSandboxManager } from '@/lib/sandbox';

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

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`Project ${projectId} not found for webhook`);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if main sandbox is running and restart it
    // The entrypoint.sh handles git fetch/reset on container restart
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(projectId, 'main');

    let restarted = false;

    if (sandbox && sandbox.status === 'running') {
      console.log(`🔄 Restarting sandbox for project ${projectId} to sync changes`);
      await sandboxManager.restartSandbox(projectId, 'main');
      restarted = true;
      console.log(`✅ Sandbox restarted for project ${projectId}`);
    } else {
      console.log(`ℹ️ Sandbox not running for project ${projectId}, skipping restart`);
    }

    // Update last sync timestamp
    await db.update(projects).set({ lastGithubSync: new Date() }).where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      sandboxRestarted: restarted,
    });
  } catch (error) {
    console.error(`Error processing webhook for project ${projectId}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

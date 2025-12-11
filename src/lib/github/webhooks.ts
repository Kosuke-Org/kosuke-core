/**
 * GitHub Webhook Management
 * Handles creating, deleting, and verifying GitHub webhooks
 */

import crypto from 'crypto';

import type { Project } from '@/lib/db/schema';

import { getOctokit } from './client';

/**
 * Get the webhook secret from environment
 */
function getWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Get the base URL for webhook callbacks
 */
function getWebhookBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL environment variable is required for webhooks');
  }
  return baseUrl;
}

/**
 * Create a GitHub webhook for a project's repository
 * @param project - The project with GitHub repo info
 * @returns The webhook ID, or null if project has no GitHub repo configured
 */
export async function createGitHubWebhook(project: Project): Promise<number | null> {
  if (!project.githubOwner || !project.githubRepoName) {
    console.log(`Project ${project.id} has no GitHub repo configured, skipping webhook`);
    return null;
  }

  const octokit = await getOctokit(project.isImported, project.createdBy!);

  const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/github/${project.id}`;
  const secret = getWebhookSecret();

  console.log(
    `Creating webhook for ${project.githubOwner}/${project.githubRepoName} -> ${webhookUrl}`
  );

  try {
    const { data: webhook } = await octokit.rest.repos.createWebhook({
      owner: project.githubOwner,
      repo: project.githubRepoName,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0', // Require SSL
      },
      events: ['push'], // Only listen to push events
      active: true,
    });

    console.log(
      `✅ Created webhook ${webhook.id} for ${project.githubOwner}/${project.githubRepoName}`
    );
    return webhook.id;
  } catch (error) {
    console.error(
      `❌ Failed to create webhook for ${project.githubOwner}/${project.githubRepoName}:`,
      error
    );
    throw new Error(
      `Failed to create webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete a GitHub webhook from a project's repository
 * @param project - The project with GitHub repo and webhook info
 */
export async function deleteGitHubWebhook(project: Project): Promise<void> {
  if (!project.githubWebhookId || !project.githubOwner || !project.githubRepoName) {
    console.log(`Project ${project.id} has no webhook to delete`);
    return;
  }

  const octokit = await getOctokit(project.isImported, project.createdBy!);

  console.log(
    `Deleting webhook ${project.githubWebhookId} from ${project.githubOwner}/${project.githubRepoName}`
  );

  try {
    await octokit.rest.repos.deleteWebhook({
      owner: project.githubOwner,
      repo: project.githubRepoName,
      hook_id: project.githubWebhookId,
    });

    console.log(
      `✅ Deleted webhook ${project.githubWebhookId} from ${project.githubOwner}/${project.githubRepoName}`
    );
  } catch (error) {
    console.error(
      `❌ Failed to delete webhook ${project.githubWebhookId} from ${project.githubOwner}/${project.githubRepoName}:`,
      error
    );
  }
}

/**
 * Verify GitHub webhook signature
 * @param payload - Raw request body as string
 * @param signature - The X-Hub-Signature-256 header value
 * @returns Whether the signature is valid
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = getWebhookSecret();

  const expectedSignature =
    'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    // If buffers are different lengths, comparison fails
    return false;
  }
}

/**
 * Type for GitHub push webhook payload (simplified)
 */
export interface GitHubPushPayload {
  ref?: string; // e.g., "refs/heads/main"
  before: string; // SHA before push
  after: string; // SHA after push
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  pusher: {
    name: string;
    email: string;
  };
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  }>;
}

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import type { Project } from '@/lib/db/schema';
import { userGithubConnections } from '@/lib/db/schema';
import type { GitHubRepository } from '@/lib/types/github';

import { refreshUserToken } from './oauth';

// GitHub App configuration
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID!;

// Token refresh buffer - refresh 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Kosuke Bot identity for commits
export const KOSUKE_BOT_NAME = 'kosuke-github-app[bot]';
export const KOSUKE_BOT_EMAIL = `${GITHUB_APP_ID}+kosuke-github-app[bot]@users.noreply.github.com`;

// GitHub App installation URL - use app's public page for better UX
const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'kosuke-github-app';
export const GITHUB_APP_INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}`;

/**
 * Create an Octokit client authenticated as the GitHub App (not installation)
 * Used for listing installations
 */
function createAppOctokit(): Octokit {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App authentication not configured.');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
    },
  });
}

/**
 * Create an Octokit client for a specific installation
 */
export function createInstallationOctokit(installationId: number): Octokit {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App authentication not configured.');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
      installationId,
    },
  });
}

/**
 * Get installation access token for git operations
 */
async function getInstallationToken(installationId: number): Promise<string> {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App authentication not configured.');
  }

  const auth = createAppAuth({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    installationId,
  });

  const { token } = await auth({ type: 'installation' });
  return token;
}

/**
 * Get Octokit for Kosuke-Org (uses env var installation ID)
 */
export function createKosukeOrgOctokit(): Octokit {
  if (!GITHUB_APP_INSTALLATION_ID) {
    throw new Error('GITHUB_APP_INSTALLATION_ID not configured.');
  }
  return createInstallationOctokit(parseInt(GITHUB_APP_INSTALLATION_ID, 10));
}

/**
 * Find installation ID for a specific repository
 * Returns null if the App is not installed on the repo
 */
export async function getInstallationForRepo(owner: string, repo: string): Promise<number | null> {
  try {
    const octokit = createAppOctokit();

    const response = await octokit.rest.apps.getRepoInstallation({
      owner,
      repo,
    });

    return response.data.id;
  } catch (error) {
    // 404 means App is not installed on this repo
    // Octokit HttpError has a `status` property with the HTTP status code
    const httpError = error as { status?: number };
    if (httpError.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a user's GitHub connection from the database
 * Used when token refresh fails (e.g., user revoked access)
 */
async function deleteGitHubConnection(userId: string): Promise<void> {
  try {
    await db.delete(userGithubConnections).where(eq(userGithubConnections.clerkUserId, userId));
    console.log(`Deleted GitHub connection for user ${userId}`);
  } catch (error) {
    console.error('Error deleting GitHub connection:', error);
  }
}

/**
 * Refresh a user's GitHub OAuth token using the refresh token
 * Returns the new access token, or null if refresh fails
 */
async function refreshGitHubToken(
  userId: string,
  currentRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null } | null> {
  try {
    // Use the centralized OAuth module for token refresh
    const result = await refreshUserToken(currentRefreshToken);

    if (!result) {
      return null;
    }

    // Calculate new expiration time
    const expiresAt = result.expiresAt ? new Date(result.expiresAt) : null;

    // Update the database with new tokens
    await db
      .update(userGithubConnections)
      .set({
        githubAccessToken: result.token,
        githubRefreshToken: result.refreshToken,
        githubTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userGithubConnections.clerkUserId, userId));

    console.log(`Refreshed GitHub token for user ${userId}`);

    return {
      accessToken: result.token,
      refreshToken: result.refreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error('Error refreshing GitHub token:', error);
    return null;
  }
}

/**
 * Get user's GitHub OAuth token from database
 * Checks token expiration and refreshes if needed (5 min buffer)
 * Returns null if user hasn't connected GitHub or token refresh fails
 */
async function getUserGitHubToken(userId: string): Promise<string | null> {
  try {
    const connection = await db
      .select({
        token: userGithubConnections.githubAccessToken,
        refreshToken: userGithubConnections.githubRefreshToken,
        expiresAt: userGithubConnections.githubTokenExpiresAt,
      })
      .from(userGithubConnections)
      .where(eq(userGithubConnections.clerkUserId, userId))
      .limit(1);

    if (connection.length === 0) {
      return null;
    }

    const { token, refreshToken, expiresAt } = connection[0];

    // Check if token is expired or expiring soon (within buffer time)
    if (expiresAt) {
      const expiresAtTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const isExpiringSoon = expiresAtTime - now < TOKEN_REFRESH_BUFFER_MS;

      if (isExpiringSoon) {
        console.log(`GitHub token for user ${userId} is expiring soon, attempting refresh...`);

        if (!refreshToken) {
          // No refresh token available - delete connection and return null
          console.warn(`No refresh token available for user ${userId}, deleting connection`);
          await deleteGitHubConnection(userId);
          return null;
        }

        // Attempt to refresh the token
        const refreshResult = await refreshGitHubToken(userId, refreshToken);

        if (!refreshResult) {
          // Refresh failed - delete connection and return null
          console.warn(`Token refresh failed for user ${userId}, deleting connection`);
          await deleteGitHubConnection(userId);
          return null;
        }

        return refreshResult.accessToken;
      }
    }

    // Token is still valid
    return token;
  } catch (error) {
    console.error('Error getting user GitHub token:', error);
    return null;
  }
}

/**
 * Check if user has GitHub connected via GitHub App OAuth
 */
export async function userHasGitHubConnected(userId: string): Promise<boolean> {
  try {
    const connection = await db
      .select({ id: userGithubConnections.id })
      .from(userGithubConnections)
      .where(eq(userGithubConnections.clerkUserId, userId))
      .limit(1);

    return connection.length > 0;
  } catch (error) {
    console.error('Error checking GitHub connection:', error);
    return false;
  }
}

/**
 * List all repositories the user has access to with their Kosuke App installation status.
 * Returns ALL repos, indicating which ones have the app installed.
 */
export async function listUserRepositoriesWithAppStatus(
  userId: string
): Promise<GitHubRepository[]> {
  // Get user's GitHub OAuth token
  const userToken = await getUserGitHubToken(userId);
  if (!userToken) {
    console.log('User has no GitHub token, returning empty list');
    return [];
  }

  // Create Octokit with user's token to list their repos
  const userOctokit = new Octokit({ auth: userToken });

  // Get all repos the user has access to with full details
  const allRepos: GitHubRepository[] = [];
  let page = 1;

  while (true) {
    const response = await userOctokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      page,
      sort: 'updated',
      direction: 'desc',
    });

    // Map to our format with appInstalled=false initially
    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      owner: { login: repo.owner.login },
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      default_branch: repo.default_branch,
      appInstalled: false,
      installationId: null as number | null,
    }));

    allRepos.push(...repos);

    if (response.data.length < 100) break;
    page++;
  }

  console.log(`User has access to ${allRepos.length} repos`);

  // For each repo, check if Kosuke App is installed (in parallel for performance)
  // Use Promise.allSettled to handle individual failures gracefully
  const results = await Promise.allSettled(
    allRepos.map(async repo => {
      const installationId = await getInstallationForRepo(repo.owner.login, repo.name);
      return {
        ...repo,
        appInstalled: installationId !== null,
        installationId,
      };
    })
  );

  // Process results, treating failures as "not installed"
  const reposWithStatus = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // If the check failed, treat as not installed
    console.warn(`Failed to check installation for ${allRepos[index].full_name}:`, result.reason);
    return {
      ...allRepos[index],
      appInstalled: false,
      installationId: null,
    };
  });

  const installedCount = reposWithStatus.filter(r => r.appInstalled).length;
  console.log(`Found ${installedCount}/${reposWithStatus.length} repos with Kosuke App installed`);

  return reposWithStatus;
}

/**
 * Get Octokit client for a project
 * Uses project's installationId if set, otherwise falls back to Kosuke-Org
 */
export function getProjectOctokit(project: Pick<Project, 'githubInstallationId'>): Octokit {
  const projectInstallationId = project.githubInstallationId;
  const fallbackInstallationId = parseInt(GITHUB_APP_INSTALLATION_ID, 10);
  const installationId = projectInstallationId || fallbackInstallationId;

  console.log('[GitHub] getProjectOctokit:', {
    projectInstallationId,
    fallbackInstallationId,
    usingInstallationId: installationId,
    usingFallback: !projectInstallationId,
  });

  return createInstallationOctokit(installationId);
}

/**
 * Get GitHub token for a project
 * Uses project's installationId if set, otherwise falls back to Kosuke-Org
 * Returns null if no installation ID is available
 */
export async function getProjectGitHubToken(
  project: Pick<Project, 'githubInstallationId'>
): Promise<string | null> {
  const installationId = project.githubInstallationId || parseInt(GITHUB_APP_INSTALLATION_ID, 10);
  if (!installationId || isNaN(installationId)) {
    return null;
  }
  return getInstallationToken(installationId);
}

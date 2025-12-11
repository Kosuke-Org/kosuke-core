import { createClerkClient } from '@clerk/nextjs/server';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

// Initialize Clerk client with environment variables
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

/**
 * Get GitHub access token for the authenticated user
 */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  try {
    const user = await clerk.users.getUser(userId);

    // Find GitHub external account
    const githubAccount = user.externalAccounts?.find(
      account => account.provider === 'oauth_github'
    );

    if (!githubAccount) {
      console.log(`No GitHub account found for user: ${userId}`);
      return null;
    }

    // Get the access token using Clerk's OAuth token endpoint
    const endpoint = `https://api.clerk.com/v1/users/${userId}/oauth_access_tokens/oauth_github`;

    const tokenResponse = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!tokenResponse.ok) {
      console.log(`Failed to get GitHub token for user: ${userId}`);
      return null;
    }

    const tokenData = await tokenResponse.json();

    // Handle array response (Clerk returns an array of tokens)
    if (Array.isArray(tokenData) && tokenData.length > 0) {
      const tokenObj = tokenData[0];
      return tokenObj.token || tokenObj.access_token || tokenObj.oauth_access_token || null;
    }

    // Handle object response
    return tokenData.token || tokenData.access_token || tokenData.oauth_access_token || null;
  } catch (error) {
    console.error('Error fetching GitHub token:', error);
    return null;
  }
}

/**
 * Get GitHub user information for the authenticated user
 */
export async function getUserGitHubInfo(userId: string): Promise<{
  githubUsername: string;
  githubId: string;
  connectedAt: Date;
} | null> {
  try {
    const user = await clerk.users.getUser(userId);

    // Find GitHub external account using Clerk SDK
    const githubAccount = user.externalAccounts?.find(
      account => account.provider === 'oauth_github'
    );

    if (!githubAccount) {
      return null;
    }

    return {
      githubUsername: githubAccount.username || '',
      githubId: githubAccount.externalId,
      connectedAt: new Date(githubAccount.verification?.expireAt || Date.now()),
    };
  } catch (error) {
    console.error('Error fetching GitHub user info:', error);
    return null;
  }
}

/**
 * Create an authenticated Octokit client for a given Clerk user
 */
export async function createUserOctokit(userId: string): Promise<Octokit> {
  const token = await getUserGitHubToken(userId);
  if (!token) {
    throw new Error('GitHub not connected');
  }
  return new Octokit({ auth: token });
}

/**
 * Create an authenticated Octokit client for Kosuke org operations using GitHub App authentication
 */
export function createKosukeOctokit(): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error('GitHub App authentication not configured.');
  }

  console.log('Using GitHub App authentication');

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey: privateKey.replace(/\\n/g, '\n'),
      installationId,
    },
  });
}

/**
 * Get an installation access token from the GitHub App
 * This token can be used for git operations (clone, push, etc.)
 */
async function getKosukeGitHubToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error('GitHub App authentication not configured.');
  }

  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    installationId,
  });

  const { token } = await auth({ type: 'installation' });
  return token;
}

/**
 * Get the appropriate Octokit client based on project type.
 * Uses Kosuke's GitHub App for Kosuke-created repos, otherwise uses user's OAuth token.
 */
export async function getOctokit(isImported: boolean | null, userId: string): Promise<Octokit> {
  if (isImported) {
    return createUserOctokit(userId);
  }
  return createKosukeOctokit();
}

/**
 * Get the appropriate GitHub token based on project type.
 * Uses Kosuke's GitHub App token for Kosuke-created repos, otherwise uses user's OAuth token.
 */
export async function getGitHubToken(
  isImported: boolean | null,
  userId: string
): Promise<string | null> {
  if (isImported) {
    return getUserGitHubToken(userId);
  }
  return getKosukeGitHubToken();
}

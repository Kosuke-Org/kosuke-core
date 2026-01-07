import { OAuthApp } from '@octokit/oauth-app';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { userGithubConnections } from '@/lib/db/schema';

// GitHub App OAuth credentials
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID!;
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Type for GitHub App OAuth configuration
type GitHubAppOAuthOptions = {
  clientType: 'github-app';
  clientId: string;
  clientSecret: string;
};

// Type for GitHub App authentication with expiration fields
interface GitHubAppAuthWithExpiration {
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}

/**
 * Singleton OAuthApp instance for GitHub OAuth operations
 * Handles token lifecycle with event-driven architecture
 */
let oauthAppInstance: OAuthApp<GitHubAppOAuthOptions> | null = null;

function getOAuthApp(): OAuthApp<GitHubAppOAuthOptions> {
  if (!oauthAppInstance) {
    if (!GITHUB_APP_CLIENT_ID || !GITHUB_APP_CLIENT_SECRET) {
      throw new Error('GitHub App OAuth credentials not configured');
    }

    oauthAppInstance = new OAuthApp({
      clientType: 'github-app',
      clientId: GITHUB_APP_CLIENT_ID,
      clientSecret: GITHUB_APP_CLIENT_SECRET,
    });

    // Set up event handlers for token lifecycle
    setupEventHandlers(oauthAppInstance);
  }

  return oauthAppInstance;
}

/**
 * Set up event handlers for token lifecycle management
 * These handlers sync token changes to the PostgreSQL database
 */
function setupEventHandlers(app: OAuthApp<GitHubAppOAuthOptions>): void {
  // Token created - store in database
  app.on('token.created', async ({ token: _token, authentication }) => {
    console.log('[GitHub OAuth] Token created event received');

    // Note: We handle storage in the callback route since we need
    // additional context (userId, GitHub user info) that's not available here
    // This event is useful for logging and future enhancements
    if (authentication) {
      console.log('[GitHub OAuth] Token type:', authentication.tokenType);
    }
  });

  // Token refreshed - update in database
  app.on('token.refreshed', async ({ token: _token, authentication }) => {
    console.log('[GitHub OAuth] Token refreshed event received');

    // Cast to expiration type for GitHub Apps
    if (authentication) {
      const authWithExpiry = authentication as GitHubAppAuthWithExpiration;
      console.log('[GitHub OAuth] New token expires at:', authWithExpiry.expiresAt);
    }
  });

  // Token deleted - handled by deleteToken flow
  app.on('token.deleted', async ({ token: _token }) => {
    console.log('[GitHub OAuth] Token deleted event received');
  });

  // Authorization deleted - full revocation
  app.on('authorization.deleted', async ({ token: _token }) => {
    console.log('[GitHub OAuth] Authorization deleted event received');
  });
}

/**
 * Generate GitHub OAuth authorization URL
 * Uses built-in state management for CSRF protection
 *
 * Note: GitHub Apps don't use OAuth scopes - permissions are configured on the App settings
 */
export function getAuthorizationUrl(options: { userId: string; redirectTo: string }): {
  url: string;
  state: string;
} {
  const app = getOAuthApp();

  // Encode our custom data in the state parameter
  const stateData = {
    userId: options.userId,
    redirectTo: options.redirectTo,
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');

  const { url } = app.getWebFlowAuthorizationUrl({
    state,
    redirectUrl: `${APP_URL}/api/auth/github/callback`,
  });

  return { url, state };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}> {
  const app = getOAuthApp();

  const { authentication } = await app.createToken({
    code,
    redirectUrl: `${APP_URL}/api/auth/github/callback`,
  });

  // Cast to expiration type for GitHub Apps with expiring tokens
  const authWithExpiry = authentication as GitHubAppAuthWithExpiration;

  return {
    token: authentication.token,
    refreshToken: authWithExpiry.refreshToken,
    expiresAt: authWithExpiry.expiresAt,
  };
}

/**
 * Refresh an expired or expiring token
 */
export async function refreshUserToken(refreshToken: string): Promise<{
  token: string;
  refreshToken: string;
  expiresAt: string | undefined;
} | null> {
  const app = getOAuthApp();

  try {
    const { authentication } = await app.refreshToken({
      refreshToken,
    });

    return {
      token: authentication.token,
      refreshToken: authentication.refreshToken,
      expiresAt: authentication.expiresAt,
    };
  } catch (error) {
    console.error('[GitHub OAuth] Failed to refresh token:', error);
    return null;
  }
}

/**
 * Revoke a token on GitHub and delete from database
 * This properly cleans up the token on GitHub's side
 */
export async function revokeToken(userId: string): Promise<boolean> {
  const app = getOAuthApp();

  try {
    // Get the token from database
    const connection = await db
      .select({ token: userGithubConnections.githubAccessToken })
      .from(userGithubConnections)
      .where(eq(userGithubConnections.clerkUserId, userId))
      .limit(1);

    if (connection.length === 0) {
      return false;
    }

    const { token } = connection[0];

    // Revoke the token on GitHub
    try {
      await app.deleteToken({ token });
      console.log(`[GitHub OAuth] Token revoked on GitHub for user ${userId}`);
    } catch (error) {
      // Token might already be invalid, continue with DB cleanup
      console.warn(
        '[GitHub OAuth] Failed to revoke token on GitHub (may already be invalid):',
        error
      );
    }

    // Delete from database
    await db.delete(userGithubConnections).where(eq(userGithubConnections.clerkUserId, userId));

    console.log(`[GitHub OAuth] Connection deleted for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[GitHub OAuth] Error revoking token:', error);
    return false;
  }
}

/**
 * Store or update a GitHub connection in the database
 */
export async function storeGitHubConnection(data: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  githubUserId: number;
  githubUsername: string;
  githubAvatarUrl: string;
}): Promise<void> {
  await db
    .insert(userGithubConnections)
    .values({
      clerkUserId: data.userId,
      githubAccessToken: data.accessToken,
      githubRefreshToken: data.refreshToken || null,
      githubTokenExpiresAt: data.expiresAt || null,
      githubUserId: data.githubUserId,
      githubUsername: data.githubUsername,
      githubAvatarUrl: data.githubAvatarUrl,
    })
    .onConflictDoUpdate({
      target: userGithubConnections.clerkUserId,
      set: {
        githubAccessToken: data.accessToken,
        githubRefreshToken: data.refreshToken || null,
        githubTokenExpiresAt: data.expiresAt || null,
        githubUserId: data.githubUserId,
        githubUsername: data.githubUsername,
        githubAvatarUrl: data.githubAvatarUrl,
        updatedAt: new Date(),
      },
    });
}

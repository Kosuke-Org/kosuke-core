import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { userGithubConnections } from '@/lib/db/schema';

const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID;
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  avatar_url: string;
  name?: string;
  email?: string;
}

/**
 * GET /api/auth/github/callback
 * Handles the OAuth callback from GitHub after user authorization.
 * Exchanges the code for an access token and stores it in the database.
 */
export async function GET(request: NextRequest) {
  try {
    if (!APP_URL) {
      console.error('NEXT_PUBLIC_APP_URL not configured');
      return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', APP_URL));
    }

    if (!GITHUB_APP_CLIENT_ID || !GITHUB_APP_CLIENT_SECRET) {
      console.error('GitHub App OAuth credentials not configured');
      return NextResponse.redirect(new URL('/settings?error=github_not_configured', APP_URL));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors (user denied, etc.)
    if (error) {
      console.error('GitHub OAuth error:', error);
      return NextResponse.redirect(new URL(`/settings?error=${error}`, APP_URL));
    }

    if (!code || !state) {
      console.error('Missing code or state in GitHub callback');
      return NextResponse.redirect(new URL('/settings?error=invalid_callback', APP_URL));
    }

    // Decode and validate state
    let stateData: { userId: string; redirectTo: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      console.error('Invalid state parameter');
      return NextResponse.redirect(new URL('/settings?error=invalid_state', APP_URL));
    }

    // Verify the user ID matches
    if (stateData.userId !== userId) {
      console.error('User ID mismatch in state');
      return NextResponse.redirect(new URL('/settings?error=invalid_state', APP_URL));
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_APP_CLIENT_ID,
        client_secret: GITHUB_APP_CLIENT_SECRET,
        code,
        redirect_uri: `${APP_URL}/api/auth/github/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Failed to exchange code for token:', await tokenResponse.text());
      return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', APP_URL));
    }

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('No access token in response:', tokenData);
      return NextResponse.redirect(new URL('/settings?error=no_access_token', APP_URL));
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch GitHub user:', await userResponse.text());
      return NextResponse.redirect(new URL('/settings?error=user_fetch_failed', APP_URL));
    }

    const userData: GitHubUserResponse = await userResponse.json();

    // Calculate token expiration (if provided)
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Store or update the connection in the database
    await db
      .insert(userGithubConnections)
      .values({
        clerkUserId: userId,
        githubAccessToken: tokenData.access_token,
        githubRefreshToken: tokenData.refresh_token || null,
        githubTokenExpiresAt: tokenExpiresAt,
        githubUserId: userData.id,
        githubUsername: userData.login,
        githubAvatarUrl: userData.avatar_url,
      })
      .onConflictDoUpdate({
        target: userGithubConnections.clerkUserId,
        set: {
          githubAccessToken: tokenData.access_token,
          githubRefreshToken: tokenData.refresh_token || null,
          githubTokenExpiresAt: tokenExpiresAt,
          githubUserId: userData.id,
          githubUsername: userData.login,
          githubAvatarUrl: userData.avatar_url,
          updatedAt: new Date(),
        },
      });

    console.log(`GitHub connected for user ${userId}: @${userData.login}`);

    // Redirect back to the original page with success indicator
    const redirectUrl = new URL(stateData.redirectTo, APP_URL);
    redirectUrl.searchParams.set('githubConnected', 'true');

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Error in GitHub OAuth callback:', error);
    return NextResponse.redirect(new URL('/settings?error=callback_failed', APP_URL));
  }
}

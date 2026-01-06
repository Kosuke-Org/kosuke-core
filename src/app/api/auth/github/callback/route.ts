import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { exchangeCodeForToken, storeGitHubConnection } from '@/lib/github/oauth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

interface GitHubUserResponse {
  id: number;
  login: string;
  avatar_url: string;
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
    let stateData: { userId: string; redirectTo: string };
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

    // Exchange code for access token using @octokit/oauth-app
    const tokenData = await exchangeCodeForToken(code);

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch GitHub user:', await userResponse.text());
      return NextResponse.redirect(new URL('/settings?error=user_fetch_failed', APP_URL));
    }

    const userData: GitHubUserResponse = await userResponse.json();

    // Calculate token expiration
    const tokenExpiresAt = tokenData.expiresAt ? new Date(tokenData.expiresAt) : null;

    // Store the connection in the database
    await storeGitHubConnection({
      userId,
      accessToken: tokenData.token,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenExpiresAt,
      githubUserId: userData.id,
      githubUsername: userData.login,
      githubAvatarUrl: userData.avatar_url,
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

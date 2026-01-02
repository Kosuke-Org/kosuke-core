import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * GET /api/auth/github/connect
 * Initiates the GitHub App OAuth flow by redirecting to GitHub's authorization page.
 *
 * Query params:
 * - redirect: URL to redirect to after successful authorization (default: /settings)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', APP_URL));
    }

    if (!GITHUB_APP_CLIENT_ID) {
      console.error('GITHUB_APP_CLIENT_ID is not configured');
      return NextResponse.json({ error: 'GitHub App not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const redirectTo = searchParams.get('redirect') || '/settings';

    // Generate a random state parameter to prevent CSRF attacks
    // Encode the redirect URL and user ID in the state
    const stateData = {
      userId,
      redirectTo,
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    // Build the GitHub OAuth authorization URL
    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', GITHUB_APP_CLIENT_ID);
    githubAuthUrl.searchParams.set('redirect_uri', `${APP_URL}/api/auth/github/callback`);
    githubAuthUrl.searchParams.set('state', state);
    // Request minimal scopes - we mainly need user info and repo access through the app installation
    githubAuthUrl.searchParams.set('scope', 'read:user');

    return NextResponse.redirect(githubAuthUrl.toString());
  } catch (error) {
    console.error('Error initiating GitHub OAuth:', error);
    return NextResponse.json({ error: 'Failed to initiate GitHub connection' }, { status: 500 });
  }
}

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthorizationUrl } from '@/lib/github/oauth';

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

    const { searchParams } = new URL(request.url);
    const redirectTo = searchParams.get('redirect') || '/settings';

    // Generate authorization URL using @octokit/oauth-app
    const { url } = getAuthorizationUrl({
      userId,
      redirectTo,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Error initiating GitHub OAuth:', error);
    return NextResponse.json({ error: 'Failed to initiate GitHub connection' }, { status: 500 });
  }
}

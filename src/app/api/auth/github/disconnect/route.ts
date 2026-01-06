import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { revokeToken } from '@/lib/github/oauth';

/**
 * POST /api/auth/github/disconnect
 * Disconnects the user's GitHub account by revoking the token on GitHub
 * and removing it from the database.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Revoke the token on GitHub and delete from database
    const revoked = await revokeToken(userId);

    if (!revoked) {
      return NextResponse.json(
        { success: true, message: 'No GitHub connection found' },
        { status: 200 }
      );
    }

    console.log(`GitHub disconnected for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'GitHub disconnected successfully',
    });
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    return ApiErrorHandler.handle(error);
  }
}

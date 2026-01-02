import { ApiErrorHandler } from '@/lib/api/errors';
import { db } from '@/lib/db/drizzle';
import { userGithubConnections } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/github/disconnect
 * Disconnects the user's GitHub account by removing their stored token.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Delete the user's GitHub connection
    const result = await db
      .delete(userGithubConnections)
      .where(eq(userGithubConnections.clerkUserId, userId))
      .returning({ id: userGithubConnections.id });

    if (result.length === 0) {
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

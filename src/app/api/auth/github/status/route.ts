import type { ApiResponse } from '@/lib/api';
import { ApiErrorHandler } from '@/lib/api/errors';
import { db } from '@/lib/db/drizzle';
import { userGithubConnections } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export interface GitHubConnectionStatus {
  isConnected: boolean;
  username: string | null;
  avatarUrl: string | null;
  connectedAt: string | null;
}

/**
 * GET /api/auth/github/status
 * Returns the user's GitHub connection status.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Check if user has a GitHub connection
    const connection = await db
      .select({
        username: userGithubConnections.githubUsername,
        avatarUrl: userGithubConnections.githubAvatarUrl,
        connectedAt: userGithubConnections.createdAt,
      })
      .from(userGithubConnections)
      .where(eq(userGithubConnections.clerkUserId, userId))
      .limit(1);

    if (connection.length === 0) {
      return NextResponse.json<ApiResponse<GitHubConnectionStatus>>({
        success: true,
        data: {
          isConnected: false,
          username: null,
          avatarUrl: null,
          connectedAt: null,
        },
      });
    }

    return NextResponse.json<ApiResponse<GitHubConnectionStatus>>({
      success: true,
      data: {
        isConnected: true,
        username: connection[0].username,
        avatarUrl: connection[0].avatarUrl,
        connectedAt: connection[0].connectedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Error fetching GitHub status:', error);
    return ApiErrorHandler.handle(error);
  }
}

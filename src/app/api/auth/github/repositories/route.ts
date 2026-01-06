import type { ApiResponse } from '@/lib/api';
import { ApiErrorHandler } from '@/lib/api/errors';
import { listUserRepositories, type GitHubRepository } from '@/lib/github';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/github/repositories
 * List all repositories the user has access to with their app installation status.
 * Returns ALL repos - those with appInstalled=true can be imported directly,
 * those with appInstalled=false need the Kosuke app installed first.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '10', 10);
    const search = searchParams.get('search') || '';

    const { repositories, hasMore, needsGitHubConnection, installUrl } = await listUserRepositories(
      userId,
      page,
      perPage,
      search
    );

    return NextResponse.json<
      ApiResponse<{
        repositories: GitHubRepository[];
        hasMore: boolean;
        needsGitHubConnection: boolean;
        installUrl: string;
      }>
    >({
      data: { repositories, hasMore, needsGitHubConnection, installUrl },
      success: true,
    });
  } catch (error) {
    console.error('Error fetching user repositories:', error);
    return ApiErrorHandler.handle(error);
  }
}

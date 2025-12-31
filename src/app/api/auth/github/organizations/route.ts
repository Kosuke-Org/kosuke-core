import type { ApiResponse } from '@/lib/api';
import { ApiErrorHandler } from '@/lib/api/errors';
import { userHasGitHubConnected } from '@/lib/github/client';
import { listUserOrganizations } from '@/lib/github';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Check if user has GitHub connected before attempting to list organizations
    const hasGitHub = await userHasGitHubConnected(userId);
    if (!hasGitHub) {
      return NextResponse.json<ApiResponse<null>>(
        {
          data: null,
          success: false,
          error: 'GitHub not connected. Please connect your GitHub account in Settings.',
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '10', 10);

    const { organizations, hasMore } = await listUserOrganizations(userId, page, perPage);

    return NextResponse.json<
      ApiResponse<{ organizations: typeof organizations; hasMore: boolean }>
    >({
      data: { organizations, hasMore },
      success: true,
    });
  } catch (error) {
    console.error('Error fetching GitHub organizations:', error);
    return ApiErrorHandler.handle(error);
  }
}

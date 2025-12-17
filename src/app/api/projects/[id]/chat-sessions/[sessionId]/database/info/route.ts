import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { verifyProjectAccess } from '@/lib/projects';
import { getDatabaseInfo } from '@/lib/sandbox/database';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId } = await params;

    if (!sessionId) {
      return ApiErrorHandler.badRequest('Session ID is required');
    }

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    const info = await getDatabaseInfo(sessionId);

    return NextResponse.json(info);
  } catch (error) {
    console.error('Error fetching database info:', error);
    return ApiErrorHandler.handle(error);
  }
}

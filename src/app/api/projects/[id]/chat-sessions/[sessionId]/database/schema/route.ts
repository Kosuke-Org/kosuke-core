import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { verifyProjectAccess } from '@/lib/projects';
import { getDatabaseSchema } from '@/lib/sandbox/database';
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

    const schema = await getDatabaseSchema(sessionId);

    return NextResponse.json(schema);
  } catch (error) {
    console.error('Error fetching database schema:', error);
    return ApiErrorHandler.handle(error);
  }
}

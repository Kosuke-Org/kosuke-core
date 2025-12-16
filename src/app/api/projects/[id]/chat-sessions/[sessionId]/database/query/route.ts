import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { verifyProjectAccess } from '@/lib/projects';
import { executeQuery } from '@/lib/sandbox/database';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
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

    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return ApiErrorHandler.badRequest('Query is required');
    }

    // Basic security check - only allow SELECT queries
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return ApiErrorHandler.badRequest('Only SELECT queries are allowed for security reasons');
    }

    const result = await executeQuery(sessionId, query);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing database query:', error);
    return ApiErrorHandler.handle(error);
  }
}

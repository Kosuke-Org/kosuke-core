import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { verifyProjectAccess } from '@/lib/projects';
import { getTableData } from '@/lib/sandbox/database';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; table: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId, table: tableName } = await params;

    if (!sessionId) {
      return ApiErrorHandler.badRequest('Session ID is required');
    }

    if (!tableName) {
      return ApiErrorHandler.badRequest('Table name is required');
    }

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get query parameters
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    const tableData = await getTableData(projectId, sessionId, tableName, limit, offset);

    return NextResponse.json(tableData);
  } catch (error) {
    console.error('Error fetching table data:', error);
    return ApiErrorHandler.handle(error);
  }
}

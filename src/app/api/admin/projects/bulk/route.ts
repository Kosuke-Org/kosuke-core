import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

/**
 * POST /api/admin/projects/bulk
 * Perform bulk operations on projects (super admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const body = await request.json();
    const { action, projectIds } = body as {
      action: 'delete';
      projectIds: string[];
    };

    if (!action || !projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (action === 'delete') {
      // Delete projects
      await db.delete(projects).where(inArray(projects.id, projectIds));

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${projectIds.length} project(s)`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error performing bulk operation:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to perform bulk operation' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

/**
 * GET /api/admin/organizations/stats
 * Get global organization statistics (admin only)
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Check super admin access
    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    // Get total organizations count from Clerk
    const { totalCount: totalOrganizations } = await clerkService.listOrganizations({
      limit: 1,
      offset: 0,
    });

    // Get total active projects
    const [projectsStats] = await db
      .select({
        totalProjects: count(),
      })
      .from(projects)
      .where(eq(projects.isArchived, false));

    return NextResponse.json({
      data: {
        totalOrganizations,
        totalActiveProjects: projectsStats?.totalProjects || 0,
      },
    });
  } catch (error) {
    console.error('[API /admin/organizations/stats] Error fetching stats:', error);
    return ApiErrorHandler.handle(error);
  }
}

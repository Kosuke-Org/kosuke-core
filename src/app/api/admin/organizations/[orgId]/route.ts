import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';

/**
 * GET /api/admin/organizations/[orgId]
 * Get organization details (admin only)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
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

    const { orgId } = await params;

    // Get organization from Clerk
    const organization = await clerkService.getOrganization(orgId);

    // Get members
    const members = await clerkService.getOrganizationMembers(orgId);

    // Get projects
    const orgProjects = await db.select().from(projects).where(eq(projects.orgId, orgId));

    return NextResponse.json({
      data: {
        organization,
        members: members.data,
        projects: orgProjects,
      },
    });
  } catch (error) {
    console.error('[API /admin/organizations/[orgId]] Error fetching organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

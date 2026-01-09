import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { getOrgUsage } from '@/lib/langfuse';

/**
 * GET /api/organizations/[orgId]/usage
 * Get aggregated usage data from Langfuse for an organization
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if user is member of the organization OR is a super admin
    const isMember = await clerkService.isOrgMember(userId, orgId);
    const isSuperAdmin = await isSuperAdminByUserId(userId);

    if (!isMember && !isSuperAdmin) {
      return ApiErrorHandler.forbidden('Not a member of this organization');
    }

    // Fetch usage data from Langfuse
    const usageData = await getOrgUsage(orgId);

    // Include Langfuse URL for super admins
    const langfuseProjectId = process.env.NEXT_PUBLIC_LANGFUSE_PROJECT_ID;
    const langfuseUrl =
      isSuperAdmin && langfuseProjectId
        ? `https://cloud.langfuse.com/project/${langfuseProjectId}/users/${orgId}?dateRange=30d`
        : undefined;

    return NextResponse.json({
      success: true,
      data: usageData,
      langfuseUrl,
    });
  } catch (error) {
    console.error('Error fetching organization usage:', error);
    return ApiErrorHandler.handle(error);
  }
}

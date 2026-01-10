import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';

/**
 * GET /api/organizations/[orgId]/details
 * Get organization details including beta status
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

    const { orgId } = await params;

    // Verify user is a member of this organization
    const isMember = await clerkService.isOrgMember(userId, orgId);
    if (!isMember) {
      return ApiErrorHandler.forbidden();
    }

    // Get organization details
    const organization = await clerkService.getOrganization(orgId);

    return NextResponse.json({
      data: {
        id: organization.id,
        name: organization.name,
        isBeta: organization.isBeta,
      },
    });
  } catch (error) {
    console.error('[API /organizations/[orgId]/details] Error fetching organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

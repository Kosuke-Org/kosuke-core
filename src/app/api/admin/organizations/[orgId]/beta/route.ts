import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';

const updateBetaSchema = z.object({
  isBeta: z.boolean(),
});

/**
 * PATCH /api/admin/organizations/[orgId]/beta
 * Toggle organization beta status (super admin only)
 */
export async function PATCH(
  request: NextRequest,
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
    const body = await request.json();

    // Validate request body
    const result = updateBetaSchema.safeParse(body);
    if (!result.success) {
      return ApiErrorHandler.badRequest('Invalid request body');
    }

    const { isBeta } = result.data;

    // Update organization beta status
    const organization = await clerkService.updateOrganizationBeta(orgId, isBeta);

    return NextResponse.json({
      data: { organization },
    });
  } catch (error) {
    console.error('[API /admin/organizations/[orgId]/beta] Error updating beta status:', error);
    return ApiErrorHandler.handle(error);
  }
}

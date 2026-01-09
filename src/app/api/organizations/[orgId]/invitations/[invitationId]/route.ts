import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; invitationId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId, invitationId } = await params;

    // Check if current user is admin
    const isAdmin = await clerkService.isOrgAdmin(userId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can revoke invitations');
    }

    // Revoke the invitation
    await clerkService.revokeOrganizationInvitation(orgId, invitationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to revoke invitation');
    }
    console.error('Failed to revoke invitation:', error);
    return ApiErrorHandler.handle(error);
  }
}

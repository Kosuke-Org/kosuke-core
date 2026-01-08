import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateRoleSchema = z.object({
  role: z.enum(['org:admin', 'org:member']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; userId: string }> }
) {
  try {
    const { userId: currentUserId } = await auth();
    if (!currentUserId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId, userId } = await params;

    // Check if current user is admin
    const isAdmin = await clerkService.isOrgAdmin(currentUserId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can change member roles');
    }

    // Check if it's a personal workspace
    const org = await clerkService.getOrganization(orgId);
    if (org.isPersonal) {
      return ApiErrorHandler.forbidden('Cannot change roles in personal workspaces');
    }

    // Prevent changing own role
    if (userId === currentUserId) {
      return ApiErrorHandler.badRequest('Cannot change your own role');
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateRoleSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.badRequest(result.error.issues.map(e => e.message).join(', '));
    }

    const { role } = result.data;

    // Update the member's role
    await clerkService.updateMemberRole(orgId, userId, role);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to update member role');
    }
    console.error('Failed to update member role:', error);
    return ApiErrorHandler.handle(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; userId: string }> }
) {
  try {
    const { userId: currentUserId } = await auth();
    if (!currentUserId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId, userId } = await params;

    // Check if current user is admin
    const isAdmin = await clerkService.isOrgAdmin(currentUserId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can remove members');
    }

    // Check if it's a personal workspace
    const org = await clerkService.getOrganization(orgId);
    if (org.isPersonal) {
      return ApiErrorHandler.forbidden('Cannot remove members from personal workspaces');
    }

    // Prevent removing yourself
    if (userId === currentUserId) {
      return ApiErrorHandler.badRequest('Cannot remove yourself. Use leave organization instead.');
    }

    // Remove the member
    await clerkService.deleteOrganizationMembership(orgId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to remove member');
    }
    console.error('Failed to remove member:', error);
    return ApiErrorHandler.handle(error);
  }
}

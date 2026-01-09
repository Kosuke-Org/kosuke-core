import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if it's a personal workspace
    const org = await clerkService.getOrganization(orgId);
    if (org.isPersonal) {
      return ApiErrorHandler.forbidden('Cannot leave personal workspace');
    }

    // Get the user's membership in this organization
    const memberships = await clerkService.getOrganizationMembers(orgId);
    const membership = memberships.data.find(m => m.publicUserData?.userId === userId);

    if (!membership) {
      return ApiErrorHandler.notFound('Membership not found');
    }

    // Delete the membership
    await clerkService.deleteOrganizationMembership(orgId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to leave organization');
    }
    console.error('Failed to leave organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

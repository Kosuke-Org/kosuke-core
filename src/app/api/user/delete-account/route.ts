import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { NextResponse } from 'next/server';

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Verify user exists
    const user = await clerkService.getUser(userId);
    if (!user) {
      return ApiErrorHandler.notFound('User not found');
    }

    // Get all org memberships
    const memberships = await clerkService.getUserMemberships(userId);

    // Find orgs with other members
    const orgsWithMembers: string[] = [];

    for (const membership of memberships.data) {
      const org = membership.organization;
      const isPersonal = org.publicMetadata?.isPersonal === true;

      if (isPersonal) continue;

      if (membership.role === 'org:admin') {
        const orgMembers = await clerkService.getOrganizationMembers(org.id);
        const otherMembers = orgMembers.data.filter(m => m.publicUserData?.userId !== userId);

        if (otherMembers.length > 0) {
          orgsWithMembers.push(org.name);
        }
      }
    }

    if (orgsWithMembers.length > 0) {
      const orgList = orgsWithMembers.map(name => `"${name}"`).join(', ');
      const message =
        orgsWithMembers.length === 1
          ? `Cannot delete account. You must transfer ownership or remove all members from ${orgList} before deleting your account.`
          : `Cannot delete account. You must transfer ownership or remove all members from these organizations: ${orgList}.`;

      return ApiErrorHandler.badRequest(message);
    }

    await clerkService.deleteUser(userId);

    return NextResponse.json({ success: 'Account deleted successfully' });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to delete account');
    }
    console.error('Error deleting account:', error);
    return ApiErrorHandler.handle(error);
  }
}

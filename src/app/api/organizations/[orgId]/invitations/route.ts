import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { ORG_ROLES } from '@/lib/types/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const inviteMemberSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'),
  role: z.enum([ORG_ROLES.ADMIN, ORG_ROLES.MEMBER]).optional().default(ORG_ROLES.MEMBER),
});

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Get organization to check if it's personal
    const org = await clerkService.getOrganization(orgId);

    // Block invitations to personal workspaces
    if (org.isPersonal) {
      return ApiErrorHandler.forbidden('Cannot invite members to personal workspaces');
    }

    // Check if user is admin
    const isAdmin = await clerkService.isOrgAdmin(userId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can invite members');
    }

    const body = await request.json();
    const result = inviteMemberSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.badRequest(result.error.issues.map(e => e.message).join(', '));
    }

    const { email, role } = result.data;

    // Check if user is already a member of the organization
    const memberships = await clerkService.getOrganizationMembers(orgId);
    const existingMember = memberships.data.find(m => m.publicUserData?.identifier === email);

    if (existingMember) {
      return ApiErrorHandler.badRequest('User is already a member of this organization');
    }

    // Check if there's already a pending invitation for this email
    const pendingInvitations = await clerkService.getOrganizationInvitations(orgId, ['pending']);
    const existingInvitation = pendingInvitations.data.find(inv => inv.emailAddress === email);

    if (existingInvitation) {
      return ApiErrorHandler.badRequest('An invitation has already been sent to this email');
    }

    // Create invitation via Clerk
    const invitation = await clerkService.createOrganizationInvitation({
      orgId,
      emailAddress: email,
      role,
      inviterUserId: userId,
    });

    return NextResponse.json({ data: invitation });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to send invitation');
    }
    console.error('Failed to create invitation:', error);
    return ApiErrorHandler.handle(error);
  }
}

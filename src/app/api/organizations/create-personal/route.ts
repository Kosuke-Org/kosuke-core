import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { addGhostMember } from '@/lib/ghost/admin-client';
import { sendUserSignupSlack } from '@/lib/slack/client';

const createPersonalWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Workspace name too long'),
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const body = await request.json();
    const result = createPersonalWorkspaceSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.badRequest(result.error.issues.map(e => e.message).join(', '));
    }

    const { name } = result.data;

    // Check if user already has a personal organization
    const memberships = await clerkService.getUserMemberships(userId);
    const existingPersonalOrg = memberships.data.find(
      membership => membership.organization.publicMetadata?.isPersonal === true
    );

    if (existingPersonalOrg) {
      // User already has a personal org, mark onboarding as complete and return it
      await clerkService.markOnboardingComplete(userId);

      return NextResponse.json({
        success: true,
        data: {
          orgId: existingPersonalOrg.organization.id,
          name: existingPersonalOrg.organization.name,
          slug: existingPersonalOrg.organization.slug,
        },
      });
    }

    // Create personal organization with constraints
    const personalOrg = await clerkService.createOrganization({
      name: name.trim(),
      createdBy: userId,
      maxAllowedMemberships: 1,
      isPersonal: true,
    });

    // Mark onboarding as complete
    await clerkService.markOnboardingComplete(userId);

    // Send Slack notification for new user signup (fire and forget)
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userName =
      user.firstName || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
    const email = user.emailAddresses[0]?.emailAddress || 'Unknown';

    // Fire-and-forget notifications (non-blocking)
    sendUserSignupSlack({
      userName,
      email,
      workspaceName: name.trim(),
    }).catch(() => {});

    addGhostMember(email, userName).catch(() => {});

    console.log(`✅ Created personal workspace for user: ${personalOrg.id} (${personalOrg.name})`);

    return NextResponse.json({
      success: true,
      data: {
        orgId: personalOrg.id,
        name: personalOrg.name,
        slug: personalOrg.slug,
      },
    });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to create personal workspace');
    }
    console.error('Error creating personal organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

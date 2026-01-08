import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';

const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Organization name too long'),
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const logoFile = formData.get('logo') as File | null;

    // Validate name
    const nameResult = createOrganizationSchema.safeParse({ name });
    if (!nameResult.success) {
      return ApiErrorHandler.badRequest(nameResult.error.issues.map(e => e.message).join(', '));
    }

    const validatedName = nameResult.data.name;

    // Create organization via Clerk
    const clerkOrg = await clerkService.createOrganization({
      name: validatedName.trim(),
      createdBy: userId,
      isPersonal: false,
    });

    // Upload logo if provided
    if (logoFile && logoFile.size > 0) {
      try {
        await clerkService.updateOrganizationLogo(clerkOrg.id, logoFile);
      } catch (logoError) {
        console.error('Failed to upload logo during org creation:', logoError);
        // Don't fail the whole operation if logo upload fails
      }
    }

    return NextResponse.json({
      data: {
        orgId: clerkOrg.id,
        name: clerkOrg.name,
        slug: clerkOrg.slug,
      },
    });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to create organization');
    }
    console.error('Error creating organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { marketingEmails } = await request.json();

    if (typeof marketingEmails !== 'boolean') {
      return ApiErrorHandler.badRequest('Invalid marketingEmails value');
    }

    // Update user's notification preferences in Clerk
    await clerkService.updateUser(userId, { marketingEmails });

    return NextResponse.json({
      success: 'Notification preferences updated successfully',
    });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to update notification preferences');
    }
    console.error('Error updating notification preferences:', error);
    return ApiErrorHandler.handle(error);
  }
}

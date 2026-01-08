import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import type { UpdateUserData } from '@/lib/types';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const user = await clerkService.getUser(userId);

    return ApiResponseHandler.success(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return ApiErrorHandler.handle(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const body = await request.json();
    const updateData: UpdateUserData = {};

    if (body.firstName !== undefined) {
      updateData.firstName = body.firstName;
    }

    if (body.lastName !== undefined) {
      updateData.lastName = body.lastName;
    }

    if (body.marketingEmails !== undefined) {
      updateData.marketingEmails = body.marketingEmails;
    }

    // Update user (service handles metadata internally)
    const updatedUser = await clerkService.updateUser(userId, updateData);

    return ApiResponseHandler.success(updatedUser);
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to update profile');
    }
    console.error('Error updating user profile:', error);
    return ApiErrorHandler.handle(error);
  }
}

import { and, eq } from 'drizzle-orm';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { notifications } from '@/lib/db/schema';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Mark all unread notifications as read for the user
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.clerkUserId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return ApiResponseHandler.success({ updated: updated.length });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return ApiErrorHandler.handle(error);
  }
}

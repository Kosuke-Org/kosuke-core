import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { notifications } from '@/lib/db/schema';

const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()),
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const body = await request.json();
    const result = markReadSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { notificationIds } = result.data;

    if (notificationIds.length === 0) {
      return ApiResponseHandler.success({ updated: 0 });
    }

    // Update only notifications that belong to the user
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.clerkUserId, userId), inArray(notifications.id, notificationIds)))
      .returning({ id: notifications.id });

    return ApiResponseHandler.success({ updated: updated.length });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return ApiErrorHandler.handle(error);
  }
}

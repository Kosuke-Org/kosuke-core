import { and, eq, notInArray, sql } from 'drizzle-orm';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { notifications, productUpdates, productUpdateReads } from '@/lib/db/schema';
import type { UnreadCounts } from '@/lib/types';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Count unread notifications
    const [{ notificationCount }] = await db
      .select({ notificationCount: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.clerkUserId, userId), eq(notifications.isRead, false)));

    // Count unread product updates (updates not in user's read list)
    const readUpdateIds = db
      .select({ id: productUpdateReads.productUpdateId })
      .from(productUpdateReads)
      .where(eq(productUpdateReads.clerkUserId, userId));

    const [{ productUpdateCount }] = await db
      .select({ productUpdateCount: sql<number>`count(*)::int` })
      .from(productUpdates)
      .where(notInArray(productUpdates.id, readUpdateIds));

    const counts: UnreadCounts = {
      notifications: notificationCount,
      productUpdates: productUpdateCount,
      total: notificationCount + productUpdateCount,
    };

    return ApiResponseHandler.success(counts);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return ApiErrorHandler.handle(error);
  }
}

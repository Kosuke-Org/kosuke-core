import { desc, eq, sql } from 'drizzle-orm';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { notifications } from '@/lib/db/schema';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const offset = (page - 1) * pageSize;

    // Get notifications for the user
    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.clerkUserId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.clerkUserId, userId));

    return ApiResponseHandler.paginated(userNotifications, {
      page,
      pageSize,
      total: count,
      hasMore: offset + userNotifications.length < count,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return ApiErrorHandler.handle(error);
  }
}

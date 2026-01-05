import { desc, sql } from 'drizzle-orm';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { productUpdates, productUpdateReads } from '@/lib/db/schema';
import type { ProductUpdateWithReadStatus } from '@/lib/types';

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

    // Get product updates with read status for the current user
    const updates = await db
      .select({
        id: productUpdates.id,
        title: productUpdates.title,
        description: productUpdates.description,
        imageUrl: productUpdates.imageUrl,
        linkUrl: productUpdates.linkUrl,
        publishedAt: productUpdates.publishedAt,
        createdAt: productUpdates.createdAt,
        readAt: productUpdateReads.readAt,
      })
      .from(productUpdates)
      .leftJoin(
        productUpdateReads,
        sql`${productUpdateReads.productUpdateId} = ${productUpdates.id} AND ${productUpdateReads.clerkUserId} = ${userId}`
      )
      .orderBy(desc(productUpdates.publishedAt))
      .limit(pageSize)
      .offset(offset);

    // Transform to include isRead boolean
    const updatesWithReadStatus: ProductUpdateWithReadStatus[] = updates.map(update => ({
      id: update.id,
      title: update.title,
      description: update.description,
      imageUrl: update.imageUrl,
      linkUrl: update.linkUrl,
      publishedAt: update.publishedAt,
      createdAt: update.createdAt,
      isRead: update.readAt !== null,
    }));

    // Get total count
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(productUpdates);

    return ApiResponseHandler.paginated(updatesWithReadStatus, {
      page,
      pageSize,
      total: count,
      hasMore: offset + updates.length < count,
    });
  } catch (error) {
    console.error('Error fetching product updates:', error);
    return ApiErrorHandler.handle(error);
  }
}

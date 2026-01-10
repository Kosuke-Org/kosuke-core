import { desc, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { productUpdates } from '@/lib/db/schema';

const createProductUpdateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  publishedAt: z.string().datetime().optional(),
});

/**
 * GET /api/admin/product-updates
 * List all product updates (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const offset = (page - 1) * pageSize;

    const updates = await db
      .select()
      .from(productUpdates)
      .orderBy(desc(productUpdates.publishedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(productUpdates);

    return ApiResponseHandler.paginated(updates, {
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

/**
 * POST /api/admin/product-updates
 * Create a new product update (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const body = await request.json();
    const result = createProductUpdateSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { title, description, imageUrl, linkUrl, publishedAt } = result.data;

    const [newUpdate] = await db
      .insert(productUpdates)
      .values({
        title,
        description,
        imageUrl: imageUrl ?? null,
        linkUrl: linkUrl ?? null,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      })
      .returning();

    return ApiResponseHandler.created(newUpdate);
  } catch (error) {
    console.error('Error creating product update:', error);
    return ApiErrorHandler.handle(error);
  }
}

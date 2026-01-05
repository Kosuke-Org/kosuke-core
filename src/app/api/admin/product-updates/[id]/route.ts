import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { productUpdates } from '@/lib/db/schema';

const updateProductUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  publishedAt: z.string().datetime().optional(),
});

/**
 * GET /api/admin/product-updates/[id]
 * Get a single product update (admin only)
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const { id } = await params;

    const [update] = await db.select().from(productUpdates).where(eq(productUpdates.id, id));

    if (!update) {
      return ApiErrorHandler.notFound('Product update not found');
    }

    return ApiResponseHandler.success(update);
  } catch (error) {
    console.error('Error fetching product update:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PUT /api/admin/product-updates/[id]
 * Update a product update (admin only)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const { id } = await params;
    const body = await request.json();
    const result = updateProductUpdateSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { title, description, imageUrl, linkUrl, publishedAt } = result.data;

    // Check if exists
    const [existing] = await db
      .select({ id: productUpdates.id })
      .from(productUpdates)
      .where(eq(productUpdates.id, id));

    if (!existing) {
      return ApiErrorHandler.notFound('Product update not found');
    }

    const [updated] = await db
      .update(productUpdates)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(linkUrl !== undefined && { linkUrl }),
        ...(publishedAt !== undefined && { publishedAt: new Date(publishedAt) }),
        updatedAt: new Date(),
      })
      .where(eq(productUpdates.id, id))
      .returning();

    return ApiResponseHandler.success(updated);
  } catch (error) {
    console.error('Error updating product update:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * DELETE /api/admin/product-updates/[id]
 * Delete a product update (admin only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const { id } = await params;

    // Check if exists
    const [existing] = await db
      .select({ id: productUpdates.id })
      .from(productUpdates)
      .where(eq(productUpdates.id, id));

    if (!existing) {
      return ApiErrorHandler.notFound('Product update not found');
    }

    await db.delete(productUpdates).where(eq(productUpdates.id, id));

    return ApiResponseHandler.success({ deleted: true });
  } catch (error) {
    console.error('Error deleting product update:', error);
    return ApiErrorHandler.handle(error);
  }
}

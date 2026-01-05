import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { productUpdates, productUpdateReads } from '@/lib/db/schema';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id } = await params;

    // Verify the product update exists
    const [update] = await db
      .select({ id: productUpdates.id })
      .from(productUpdates)
      .where(eq(productUpdates.id, id));

    if (!update) {
      return ApiErrorHandler.notFound('Product update not found');
    }

    // Insert read record (ignore if already exists due to unique constraint)
    await db
      .insert(productUpdateReads)
      .values({
        clerkUserId: userId,
        productUpdateId: id,
      })
      .onConflictDoNothing();

    return ApiResponseHandler.success({ marked: true });
  } catch (error) {
    console.error('Error marking product update as read:', error);
    return ApiErrorHandler.handle(error);
  }
}

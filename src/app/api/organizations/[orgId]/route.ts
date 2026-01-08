import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if user is admin
    const isAdmin = await clerkService.isOrgAdmin(userId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only admins can delete organizations');
    }

    // Check if org is personal
    const org = await clerkService.getOrganization(orgId);
    if (org.isPersonal) {
      return ApiErrorHandler.badRequest('Cannot delete personal workspace');
    }

    // Clean up projects first
    await db.delete(projects).where(eq(projects.orgId, orgId));

    // Delete organization
    await clerkService.deleteOrganization(orgId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Failed to delete organization');
    }
    console.error('Error deleting organization:', error);
    return ApiErrorHandler.handle(error);
  }
}

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { db } from '@/lib/db/drizzle';
import { maintenanceSettings } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';

const updateMaintenanceSettingsSchema = z.object({
  syncRulesEnabled: z.boolean().optional(),
  analyzeEnabled: z.boolean().optional(),
  securityCheckEnabled: z.boolean().optional(),
});

/**
 * GET /api/projects/[id]/maintenance-settings
 * Get maintenance settings for a project
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);
    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get maintenance settings (may not exist yet)
    const settings = await db.query.maintenanceSettings.findFirst({
      where: eq(maintenanceSettings.projectId, projectId),
    });

    // Return defaults if no settings exist yet
    if (!settings) {
      return ApiResponseHandler.success({
        syncRulesEnabled: false,
        analyzeEnabled: false,
        securityCheckEnabled: false,
      });
    }

    return ApiResponseHandler.success({
      syncRulesEnabled: settings.syncRulesEnabled,
      analyzeEnabled: settings.analyzeEnabled,
      securityCheckEnabled: settings.securityCheckEnabled,
    });
  } catch (error) {
    console.error('Error getting maintenance settings:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PUT /api/projects/[id]/maintenance-settings
 * Update maintenance settings (upsert - creates if doesn't exist)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access and is admin
    const { hasAccess, project, isOrgAdmin } = await verifyProjectAccess(userId, projectId);
    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Only org admins can update maintenance settings
    if (!isOrgAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can update maintenance settings');
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateMaintenanceSettingsSchema.safeParse(body);
    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    // Upsert the maintenance settings
    const [updatedSettings] = await db
      .insert(maintenanceSettings)
      .values({
        projectId,
        syncRulesEnabled: result.data.syncRulesEnabled ?? false,
        analyzeEnabled: result.data.analyzeEnabled ?? false,
        securityCheckEnabled: result.data.securityCheckEnabled ?? false,
      })
      .onConflictDoUpdate({
        target: maintenanceSettings.projectId,
        set: {
          ...(result.data.syncRulesEnabled !== undefined && {
            syncRulesEnabled: result.data.syncRulesEnabled,
          }),
          ...(result.data.analyzeEnabled !== undefined && {
            analyzeEnabled: result.data.analyzeEnabled,
          }),
          ...(result.data.securityCheckEnabled !== undefined && {
            securityCheckEnabled: result.data.securityCheckEnabled,
          }),
          updatedAt: new Date(),
        },
      })
      .returning();

    return ApiResponseHandler.success({
      syncRulesEnabled: updatedSettings.syncRulesEnabled,
      analyzeEnabled: updatedSettings.analyzeEnabled,
      securityCheckEnabled: updatedSettings.securityCheckEnabled,
    });
  } catch (error) {
    console.error('Error updating maintenance settings:', error);
    return ApiErrorHandler.handle(error);
  }
}

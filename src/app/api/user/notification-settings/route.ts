import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { userNotificationSettings } from '@/lib/db/schema';

const updateSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  projectUpdates: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
});

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Get or create default settings
    let settings = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.clerkUserId, userId))
      .then(rows => rows[0]);

    if (!settings) {
      // Create default settings
      const [newSettings] = await db
        .insert(userNotificationSettings)
        .values({
          clerkUserId: userId,
          emailNotifications: true,
          projectUpdates: true,
          productUpdates: true,
        })
        .returning();

      settings = newSettings;
    }

    return ApiResponseHandler.success({
      emailNotifications: settings.emailNotifications,
      projectUpdates: settings.projectUpdates,
      productUpdates: settings.productUpdates,
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return ApiErrorHandler.handle(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const body = await request.json();
    const result = updateSettingsSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { emailNotifications, projectUpdates, productUpdates } = result.data;

    // Check if settings exist
    const existing = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.clerkUserId, userId))
      .then(rows => rows[0]);

    let settings;

    if (existing) {
      // Update existing settings
      const [updated] = await db
        .update(userNotificationSettings)
        .set({
          ...(emailNotifications !== undefined && { emailNotifications }),
          ...(projectUpdates !== undefined && { projectUpdates }),
          ...(productUpdates !== undefined && { productUpdates }),
          updatedAt: new Date(),
        })
        .where(eq(userNotificationSettings.clerkUserId, userId))
        .returning();

      settings = updated;
    } else {
      // Create new settings
      const [created] = await db
        .insert(userNotificationSettings)
        .values({
          clerkUserId: userId,
          emailNotifications: emailNotifications ?? true,
          projectUpdates: projectUpdates ?? true,
          productUpdates: productUpdates ?? true,
        })
        .returning();

      settings = created;
    }

    return ApiResponseHandler.success({
      emailNotifications: settings.emailNotifications,
      projectUpdates: settings.projectUpdates,
      productUpdates: settings.productUpdates,
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return ApiErrorHandler.handle(error);
  }
}

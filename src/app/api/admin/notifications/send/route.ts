import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { notifications, userNotificationSettings } from '@/lib/db/schema';
import { emailClient } from '@/lib/email';

const sendNotificationSchema = z.object({
  userIds: z.array(z.string()).min(1),
  type: z.enum(['admin_message', 'project_update', 'system']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  linkUrl: z.string().url().optional().nullable(),
  linkLabel: z.string().max(100).optional().nullable(),
  sendEmail: z.boolean().default(false),
});

/**
 * POST /api/admin/notifications/send
 * Send notification to user(s) (admin only)
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
    const result = sendNotificationSchema.safeParse(body);

    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { userIds, type, title, message, linkUrl, linkLabel, sendEmail } = result.data;

    // Create notifications for all users
    const notificationValues = userIds.map(clerkUserId => ({
      clerkUserId,
      type,
      title,
      message,
      linkUrl: linkUrl ?? null,
      linkLabel: linkLabel ?? null,
    }));

    const createdNotifications = await db
      .insert(notifications)
      .values(notificationValues)
      .returning();

    // Send emails if requested
    let emailsSent = 0;
    if (sendEmail) {
      for (const clerkUserId of userIds) {
        try {
          // Check user's email notification settings
          const [settings] = await db
            .select()
            .from(userNotificationSettings)
            .where(eq(userNotificationSettings.clerkUserId, clerkUserId));

          // Skip if email notifications are disabled
          if (settings && !settings.emailNotifications) {
            continue;
          }

          // Get user's email from Clerk
          const user = await clerkService.getUser(clerkUserId);
          if (user?.email) {
            await emailClient.sendNotification({
              recipientEmail: user.email,
              title,
              message,
              linkUrl: linkUrl ?? undefined,
              linkLabel: linkLabel ?? undefined,
            });
            emailsSent++;
          }
        } catch (emailError) {
          console.error(`Failed to send email to user ${clerkUserId}:`, emailError);
          // Continue with other users even if one fails
        }
      }
    }

    return ApiResponseHandler.created({
      notificationsCreated: createdNotifications.length,
      emailsSent,
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return ApiErrorHandler.handle(error);
  }
}

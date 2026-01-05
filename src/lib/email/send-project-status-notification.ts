import type { ProjectStatus } from '@/lib/db/schema';
import { DEFAULT_FROM_EMAIL, REPLY_TO_EMAIL, resend } from './resend';

interface ProjectStatusNotificationOptions {
  recipientEmail: string;
  recipientName: string | null;
  projectId: string;
  projectName: string;
  previousStatus: ProjectStatus;
  newStatus: ProjectStatus;
  stripeInvoiceUrl?: string | null;
}

// Status display names
const STATUS_DISPLAY_NAMES: Record<ProjectStatus, string> = {
  requirements: 'Requirements Gathering',
  requirements_ready: 'Requirements Ready',
  environments_ready: 'Environments Ready',
  waiting_for_payment: 'Waiting for Payment',
  paid: 'Paid',
  in_development: 'In Development',
  active: 'Active',
};

// Email content based on new status
function getEmailContent(options: ProjectStatusNotificationOptions): {
  subject: string;
  body: string;
} {
  const { projectName, newStatus, stripeInvoiceUrl } = options;
  const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/projects/${options.projectId}`;

  switch (newStatus) {
    case 'waiting_for_payment':
      return {
        subject: `[Kosuke] Payment required for "${projectName}"`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Payment Required</h2>
            <p>Hi${options.recipientName ? ` ${options.recipientName}` : ''},</p>
            <p>Your requirements for <strong>${projectName}</strong> have been reviewed and validated.</p>
            <p>Please complete the payment to start development on your project.</p>
            ${
              stripeInvoiceUrl
                ? `<p style="margin: 24px 0;">
                <a href="${stripeInvoiceUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pay Invoice</a>
              </p>`
                : '<p>An invoice link will be sent to you shortly.</p>'
            }
            <p>
              <a href="${projectUrl}">View your project</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #666; font-size: 12px;">
              This email was sent by Kosuke. If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      };

    case 'paid':
      return {
        subject: `[Kosuke] Payment received for "${projectName}"`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Payment Received</h2>
            <p>Hi${options.recipientName ? ` ${options.recipientName}` : ''},</p>
            <p>Thank you! Your payment for <strong>${projectName}</strong> has been received.</p>
            <p>An engineer from the Kosuke team will start working on your project soon. You will be notified when development begins.</p>
            <p><strong>Expected delivery: 48 hours</strong></p>
            <p style="margin: 24px 0;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Project</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #666; font-size: 12px;">
              This email was sent by Kosuke. If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      };

    case 'in_development':
      return {
        subject: `[Kosuke] Development started for "${projectName}"`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Development Started</h2>
            <p>Hi${options.recipientName ? ` ${options.recipientName}` : ''},</p>
            <p>Great news! Development has started on <strong>${projectName}</strong>.</p>
            <p>Our team is now working on building your project. You will be notified when it's ready.</p>
            <p style="margin: 24px 0;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Project</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #666; font-size: 12px;">
              This email was sent by Kosuke. If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      };

    case 'active':
      return {
        subject: `[Kosuke] "${projectName}" is now ready!`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Your Project is Ready!</h2>
            <p>Hi${options.recipientName ? ` ${options.recipientName}` : ''},</p>
            <p>Your project <strong>${projectName}</strong> is now complete and ready to use!</p>
            <p>You can now access all features and start using your project.</p>
            <p style="margin: 24px 0;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Project</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #666; font-size: 12px;">
              This email was sent by Kosuke. If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      };

    default:
      return {
        subject: `[Kosuke] Status update for "${projectName}"`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Project Status Updated</h2>
            <p>Hi${options.recipientName ? ` ${options.recipientName}` : ''},</p>
            <p>The status of your project <strong>${projectName}</strong> has been updated.</p>
            <p>
              <strong>Previous status:</strong> ${STATUS_DISPLAY_NAMES[options.previousStatus]}<br />
              <strong>New status:</strong> ${STATUS_DISPLAY_NAMES[newStatus]}
            </p>
            <p style="margin: 24px 0;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Project</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #666; font-size: 12px;">
              This email was sent by Kosuke. If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      };
  }
}

/**
 * Send email notification when project status changes
 * Non-blocking - failures are logged but don't throw
 */
export async function sendProjectStatusNotification(
  options: ProjectStatusNotificationOptions
): Promise<void> {
  if (!resend) {
    console.warn('[Email] Resend not configured, skipping project status notification email');
    return;
  }

  const { subject, body } = getEmailContent(options);

  try {
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      replyTo: REPLY_TO_EMAIL,
      to: options.recipientEmail,
      subject,
      html: body,
    });

    if (error) {
      console.error('[Email] Failed to send project status notification:', error);
      return;
    }

    console.log(
      `[Email] ✅ Project status notification sent to ${options.recipientEmail} for project ${options.projectId}`
    );
  } catch (error) {
    console.error('[Email] Error sending project status notification:', error);
  }
}

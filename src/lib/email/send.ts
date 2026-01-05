/**
 * Core email sending function
 * Centralizes Resend logic, error handling, and logging
 */

import { DEFAULT_FROM_EMAIL, REPLY_TO_EMAIL, resend } from './resend';

interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML email body */
  html: string;
  /** Context for logging (e.g., "project status", "notification") */
  logContext?: string;
}

/**
 * Send an email via Resend
 * Non-blocking - failures are logged but don't throw
 *
 * @returns true if email was sent successfully, false otherwise
 */
export async function sendEmail({
  to,
  subject,
  html,
  logContext = 'email',
}: SendEmailOptions): Promise<boolean> {
  if (!resend) {
    console.warn(`[Email] Resend not configured, skipping ${logContext}`);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      replyTo: REPLY_TO_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Failed to send ${logContext}:`, error);
      return false;
    }

    console.log(`[Email] ✅ ${logContext} sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`[Email] Error sending ${logContext}:`, error);
    return false;
  }
}

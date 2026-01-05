/**
 * Base email template wrapper
 * Provides consistent structure, styling, and footer for all emails
 */

import { emailDivider } from './components';

interface BaseEmailOptions {
  /** Main email body HTML content */
  content: string;
  /** Show notification settings link in footer (for user notification emails) */
  showSettingsLink?: boolean;
}

/**
 * Wraps email content in a consistent base template
 * - Max-width container with Arial font
 * - Standard footer with Kosuke branding
 * - Optional notification preferences link
 */
export function wrapEmailTemplate({ content, showSettingsLink = false }: BaseEmailOptions): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kosuke.ai';

  const settingsLink = showSettingsLink
    ? ` You can manage your notification preferences in your <a href="${appUrl}/settings/notifications" style="color: #666;">account settings</a>.`
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${content}
      ${emailDivider()}
      <p style="color: #666; font-size: 12px;">
        This email was sent by Kosuke. If you have any questions, please contact our support team.${settingsLink}
      </p>
    </div>
  `;
}

/**
 * Email Client
 * Centralized email sending with pre-built templates
 */

import type { ProjectStatus } from '@/lib/db/schema';

import { sendEmail } from './send';
import {
  emailBold,
  emailButton,
  emailGreeting,
  emailHeading,
  emailKeyValue,
  emailLink,
  emailParagraph,
  wrapEmailTemplate,
} from './templates';

// ============================================================================
// Types
// ============================================================================

interface NotificationEmailOptions {
  recipientEmail: string;
  title: string;
  message: string;
  linkUrl?: string;
  linkLabel?: string;
}

interface ProjectStatusEmailOptions {
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

// ============================================================================
// Email Client
// ============================================================================

export const emailClient = {
  /**
   * Send a generic notification email
   * Non-blocking - failures are logged but don't throw
   */
  async sendNotification(options: NotificationEmailOptions): Promise<void> {
    const { recipientEmail, title, message, linkUrl, linkLabel } = options;

    const content = `
      ${emailHeading(title)}
      ${emailParagraph(message)}
      ${linkUrl ? emailButton(linkUrl, linkLabel || 'View Details') : ''}
    `;

    const html = wrapEmailTemplate({ content, showSettingsLink: true });

    await sendEmail({
      to: recipientEmail,
      subject: `[Kosuke] ${title}`,
      html,
      logContext: 'notification',
    });
  },

  /**
   * Send project status change notification
   * Non-blocking - failures are logged but don't throw
   */
  async sendProjectStatusNotification(options: ProjectStatusEmailOptions): Promise<void> {
    const { subject, content } = getProjectStatusEmailContent(options);
    const html = wrapEmailTemplate({ content, showSettingsLink: false });

    await sendEmail({
      to: options.recipientEmail,
      subject,
      html,
      logContext: `project status notification (${options.projectId})`,
    });
  },
};

// ============================================================================
// Helpers
// ============================================================================

function getProjectStatusEmailContent(options: ProjectStatusEmailOptions): {
  subject: string;
  content: string;
} {
  const { projectName, newStatus, recipientName, stripeInvoiceUrl, projectId, previousStatus } =
    options;
  const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/projects/${projectId}`;

  switch (newStatus) {
    case 'waiting_for_payment':
      return {
        subject: `[Kosuke] Payment required for "${projectName}"`,
        content: `
          ${emailHeading('Payment Required')}
          ${emailGreeting(recipientName)}
          ${emailParagraph(`Your requirements for ${emailBold(projectName)} have been reviewed and validated.`)}
          ${emailParagraph('Please complete the payment to start development on your project.')}
          ${stripeInvoiceUrl ? emailButton(stripeInvoiceUrl, 'Pay Invoice') : emailParagraph('An invoice link will be sent to you shortly.')}
          ${emailParagraph(emailLink(projectUrl, 'View your project'))}
        `,
      };

    case 'paid':
      return {
        subject: `[Kosuke] Payment received for "${projectName}"`,
        content: `
          ${emailHeading('Payment Received')}
          ${emailGreeting(recipientName)}
          ${emailParagraph(`Thank you! Your payment for ${emailBold(projectName)} has been received.`)}
          ${emailParagraph('An engineer from the Kosuke team will start working on your project soon. You will be notified when development begins.')}
          ${emailParagraph(emailBold('Expected delivery: 48 hours'))}
          ${emailButton(projectUrl, 'View Project')}
        `,
      };

    case 'in_development':
      return {
        subject: `[Kosuke] Development started for "${projectName}"`,
        content: `
          ${emailHeading('Development Started')}
          ${emailGreeting(recipientName)}
          ${emailParagraph(`Great news! Development has started on ${emailBold(projectName)}.`)}
          ${emailParagraph("Our team is now working on building your project. You will be notified when it's ready.")}
          ${emailButton(projectUrl, 'View Project')}
        `,
      };

    case 'active':
      return {
        subject: `[Kosuke] "${projectName}" is now ready!`,
        content: `
          ${emailHeading('Your Project is Ready!')}
          ${emailGreeting(recipientName)}
          ${emailParagraph(`Your project ${emailBold(projectName)} is now complete and ready to use!`)}
          ${emailParagraph('You can now access all features and start using your project.')}
          ${emailButton(projectUrl, 'View Project')}
        `,
      };

    default:
      return {
        subject: `[Kosuke] Status update for "${projectName}"`,
        content: `
          ${emailHeading('Project Status Updated')}
          ${emailGreeting(recipientName)}
          ${emailParagraph(`The status of your project ${emailBold(projectName)} has been updated.`)}
          ${emailParagraph(`
            ${emailKeyValue('Previous status', STATUS_DISPLAY_NAMES[previousStatus])}<br />
            ${emailKeyValue('New status', STATUS_DISPLAY_NAMES[newStatus])}
          `)}
          ${emailButton(projectUrl, 'View Project')}
        `,
      };
  }
}

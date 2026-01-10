import 'server-only';

/**
 * Slack Notification Client
 * Centralized helper for sending Slack notifications via webhooks
 */

interface SlackBlockElement {
  type: string;
  text?: string | { type: string; text: string; emoji?: boolean };
  url?: string;
  style?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: SlackBlockElement[];
}

/**
 * Send a Slack notification via webhook
 * Non-blocking: errors are logged but not thrown
 */
async function sendSlackNotification(blocks: SlackBlock[], fallbackText: string): Promise<void> {
  const webhookUrl = process.env.SLACK_DEV_CHANNEL_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_DEV_CHANNEL_WEBHOOK_URL not configured, skipping notification');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallbackText, blocks }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack] Failed to send notification:', response.status, errorText);
    }
  } catch (error) {
    console.error('[Slack] Error sending notification:', error);
    // Non-blocking: don't throw
  }
}

// ============================================================================
// User Signup Notification
// ============================================================================

interface SendUserSignupSlackOptions {
  userName: string;
  email: string;
  workspaceName: string;
}

/**
 * Send Slack notification when a new user completes onboarding
 */
export async function sendUserSignupSlack(options: SendUserSignupSlackOptions): Promise<void> {
  const { userName, email, workspaceName } = options;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'New User Signup',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*User:*\n${userName}` },
        { type: 'mrkdwn', text: `*Email:*\n${email}` },
      ],
    },
    {
      type: 'section',
      fields: [{ type: 'mrkdwn', text: `*Workspace:*\n${workspaceName}` }],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Signed up at ${new Date().toISOString()}` }],
    },
  ];

  await sendSlackNotification(blocks, `New user signup: ${userName} (${email})`);
  console.log(`[Slack] User signup notification sent for ${email}`);
}

// ============================================================================
// Human Mode Message Notification
// ============================================================================

interface SendHumanModeMessageSlackOptions {
  projectId: string;
  projectName: string;
  sessionId: string;
  userName: string;
  userEmail?: string;
}

/**
 * Send Slack notification when a user sends a message in human_assisted mode
 */
export async function sendHumanModeMessageSlack(
  options: SendHumanModeMessageSlackOptions
): Promise<void> {
  const { projectId, projectName, sessionId, userName, userEmail } = options;

  const adminBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!adminBaseUrl) {
    console.warn('[Slack] NEXT_PUBLIC_APP_URL not configured, skipping notification');
    return;
  }
  const adminUrl = `${adminBaseUrl}/admin/projects/${projectId}/sessions/${sessionId}`;

  const userDisplay = userEmail ? `${userName} (${userEmail})` : userName;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'New Message (Human Mode)',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Project:*\n${projectName}` },
        { type: 'mrkdwn', text: `*User:*\n${userDisplay}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Chat Session',
            emoji: true,
          },
          url: adminUrl,
          style: 'primary',
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Session ID: \`${sessionId}\`` }],
    },
  ];

  await sendSlackNotification(
    blocks,
    `New message in human mode: ${projectName} from ${userDisplay} - ${adminUrl}`
  );
  console.log(`[Slack] Human mode message notification sent for session ${sessionId}`);
}

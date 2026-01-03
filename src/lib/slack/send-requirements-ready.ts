import 'server-only';

/**
 * Send Slack notification when project requirements are confirmed
 * Uses the dev channel webhook configured in environment variables
 */

interface SendRequirementsReadySlackOptions {
  projectId: string;
  projectName: string;
  orgName?: string;
  confirmedBy?: string;
}

/**
 * Send Slack notification for requirements_ready status
 * Links to the admin project page for review
 */
export async function sendRequirementsReadySlack(
  options: SendRequirementsReadySlackOptions
): Promise<void> {
  const { projectId, projectName, orgName, confirmedBy } = options;

  const webhookUrl = process.env.SLACK_DEV_CHANNEL_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_DEV_CHANNEL_WEBHOOK_URL not configured, skipping notification');
    return;
  }

  try {
    const adminBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.kosuke.ai';
    const adminUrl = `${adminBaseUrl}/admin/projects/${projectId}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 Requirements Ready for Review',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Project:*\n${projectName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Organization:*\n${orgName || 'N/A'}`,
          },
        ],
      },
      ...(confirmedBy
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Confirmed by:* ${confirmedBy}`,
              },
            },
          ]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Admin',
              emoji: true,
            },
            url: adminUrl,
            style: 'primary',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Project ID: \`${projectId}\``,
          },
        ],
      },
    ];

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: `📋 Requirements Ready: ${projectName} - ${adminUrl}`,
        blocks,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack] Failed to send notification:', response.status, errorText);
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    console.log(`[Slack] ✅ Requirements ready notification sent for project ${projectId}`);
  } catch (error) {
    console.error('[Slack] Error sending requirements ready notification:', error);
    // Don't throw - Slack notifications are non-critical
  }
}

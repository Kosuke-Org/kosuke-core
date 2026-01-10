import { Resend } from 'resend';

// Create Resend client
const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('[Resend] No API key configured (RESEND_API_KEY)');
}

export const resend = apiKey ? new Resend(apiKey) : null;

// Email configuration from environment variables (required)
const fromName = process.env.RESEND_FROM_NAME;
const fromEmail = process.env.RESEND_FROM_EMAIL;
const replyTo = process.env.RESEND_REPLY_TO;

if (!fromName || !fromEmail) {
  console.warn('[Resend] RESEND_FROM_NAME or RESEND_FROM_EMAIL not configured');
}

export const DEFAULT_FROM_EMAIL = fromName && fromEmail ? `${fromName} <${fromEmail}>` : '';
export const REPLY_TO_EMAIL = replyTo ?? '';

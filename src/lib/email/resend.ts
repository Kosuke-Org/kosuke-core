import { Resend } from 'resend';

// Create Resend client
const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('[Resend] No API key configured (RESEND_API_KEY)');
}

export const resend = apiKey ? new Resend(apiKey) : null;

// Email configuration from environment variables
const fromName = process.env.RESEND_FROM_NAME || 'Kosuke';
const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@kosuke.ai';

export const DEFAULT_FROM_EMAIL = `${fromName} <${fromEmail}>`;
export const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || 'support@kosuke.ai';

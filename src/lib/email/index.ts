// Email client (primary API)
export { emailClient } from './client';

// Core utilities (for custom emails)
export { resend, DEFAULT_FROM_EMAIL, REPLY_TO_EMAIL } from './resend';
export { sendEmail } from './send';

// Template components (for custom emails)
export {
  emailBold,
  emailButton,
  emailDivider,
  emailGreeting,
  emailHeading,
  emailKeyValue,
  emailLink,
  emailParagraph,
  wrapEmailTemplate,
} from './templates';

/**
 * Reusable email HTML components
 * These functions generate inline-styled HTML for email compatibility
 */

/**
 * Primary call-to-action button
 */
export function emailButton(href: string, label: string): string {
  return `
    <p style="margin: 24px 0;">
      <a href="${href}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">${label}</a>
    </p>
  `;
}

/**
 * Simple text link
 */
export function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color: #000;">${label}</a>`;
}

/**
 * Horizontal divider
 */
export function emailDivider(): string {
  return `<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />`;
}

/**
 * Personalized greeting
 * Shows "Hi John," if name provided, otherwise "Hi,"
 */
export function emailGreeting(name?: string | null): string {
  return `<p>Hi${name ? ` ${name}` : ''},</p>`;
}

/**
 * Paragraph with standard styling
 */
export function emailParagraph(content: string): string {
  return `<p>${content}</p>`;
}

/**
 * Bold text inline
 */
export function emailBold(text: string): string {
  return `<strong>${text}</strong>`;
}

/**
 * Heading level 2
 */
export function emailHeading(text: string): string {
  return `<h2>${text}</h2>`;
}

/**
 * Key-value pair for displaying info like "Status: Active"
 */
export function emailKeyValue(key: string, value: string): string {
  return `<strong>${key}:</strong> ${value}`;
}

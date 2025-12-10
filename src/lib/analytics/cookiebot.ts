/**
 * Cookiebot consent utilities
 * Centralized helpers for checking cookie consent state
 */

/**
 * Check if Cookiebot has loaded and user has responded to consent dialog
 */
export function isCookiebotReady(): boolean {
  if (typeof window === 'undefined') return false;
  return window.Cookiebot?.hasResponse === true;
}

/**
 * Check if user has given consent for statistics cookies
 * Used for: PostHog, Sentry, and other analytics/tracking tools
 */
export function hasStatisticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.Cookiebot?.hasResponse) return false;
  return window.Cookiebot.consent?.statistics === true;
}

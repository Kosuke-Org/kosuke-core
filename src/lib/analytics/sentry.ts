/**
 * Sentry client-side initialization with Cookiebot consent
 */

import * as Sentry from '@sentry/nextjs';

import { hasStatisticsConsent, isCookiebotReady } from './cookiebot';

/**
 * Sentry configuration with replay enabled (only used when consent exists)
 */
function getSentryConfig() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    integrations: [Sentry.replayIntegration()],
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
  };
}

/**
 * Initialize Sentry with replay (only called when consent exists)
 */
function initSentry() {
  if (Sentry.getClient()) return;
  Sentry.init(getSentryConfig());
}

/**
 * Setup Sentry with Cookiebot consent integration
 * Call this from instrumentation-client.ts
 */
export function setupSentryWithConsent() {
  if (typeof window === 'undefined') return;

  const handleCookiebotReady = () => {
    if (hasStatisticsConsent()) {
      initSentry();
    }
    // One-time event, clean up listener
    window.removeEventListener('CookiebotOnLoad', handleCookiebotReady);
  };

  // Check if Cookiebot already loaded with response
  if (isCookiebotReady()) {
    handleCookiebotReady();
  } else {
    window.addEventListener('CookiebotOnLoad', handleCookiebotReady);
  }

  // Listen for consent changes
  window.addEventListener('CookiebotOnAccept', () => {
    if (hasStatisticsConsent()) {
      initSentry();
    }
  });

  window.addEventListener('CookiebotOnDecline', () => {
    const client = Sentry.getClient();
    if (client && !hasStatisticsConsent()) {
      Sentry.close();
    }
  });
}

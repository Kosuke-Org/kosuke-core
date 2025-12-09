/**
 * Sentry client-side initialization with Cookiebot consent
 */

import * as Sentry from '@sentry/nextjs';

import { hasStatisticsConsent, isCookiebotReady } from './cookiebot';

/**
 * Get Sentry initialization configuration
 * Only includes replay integration when consent is given
 */
function getSentryConfig(includeReplay: boolean) {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    integrations: includeReplay ? [Sentry.replayIntegration()] : [],
    tracesSampleRate: 1,
    replaysSessionSampleRate: includeReplay ? 0.1 : 0,
    replaysOnErrorSampleRate: includeReplay ? 1.0 : 0,
    debug: false,
  };
}

/**
 * Initialize Sentry with consent-aware configuration
 */
function initSentry() {
  if (Sentry.getClient()) return; // Already initialized
  Sentry.init(getSentryConfig(hasStatisticsConsent()));
}

/**
 * Enable replay by reinitializing Sentry with full replay config.
 */
async function enableSentryReplay() {
  const client = Sentry.getClient();
  if (client) {
    // Check if replay already exists
    if (client.getIntegrationByName('Replay')) return;
    // Close existing client to reinit with replay config
    await Sentry.close();
  }
  Sentry.init(getSentryConfig(true));
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
      if (!Sentry.getClient()) {
        initSentry();
      } else {
        enableSentryReplay();
      }
    }
  });

  window.addEventListener('CookiebotOnDecline', () => {
    const client = Sentry.getClient();
    if (client && !hasStatisticsConsent()) {
      Sentry.close();
    }
  });
}

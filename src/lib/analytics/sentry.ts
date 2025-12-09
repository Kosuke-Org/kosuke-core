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
 * Add replay integration after consent is given
 */
function enableSentryReplay() {
  const client = Sentry.getClient();
  if (!client) {
    Sentry.init(getSentryConfig(true));
    return;
  }

  // Add replay integration to existing client
  const existingReplay = client.getIntegrationByName('Replay');
  if (!existingReplay) {
    client.addIntegration(Sentry.replayIntegration());
  }
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

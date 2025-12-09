/**
 * Analytics module - Centralized analytics utilities
 */

export { hasStatisticsConsent, isCookiebotReady } from './cookiebot';
export {
  ANALYTICS_EVENTS,
  FEATURE_EVENTS,
  PROJECT_EVENTS,
  SUBSCRIPTION_EVENTS,
  USER_EVENTS,
} from './events';
export type { AnalyticsEvent } from './events';
export { initPostHog, posthog } from './posthog';
export { setupSentryWithConsent } from './sentry';

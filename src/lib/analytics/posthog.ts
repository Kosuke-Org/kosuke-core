import posthog from 'posthog-js';

import { hasStatisticsConsent } from './cookiebot';

export function initPostHog() {
  if (typeof window === 'undefined') return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    console.warn('PostHog API key not found. Analytics will be disabled.');
    return;
  }

  if (!hasStatisticsConsent()) {
    return;
  }

  if (!posthog.__loaded) {
    posthog.init(apiKey, {
      api_host: apiHost,
      person_profiles: 'identified_only',
      capture_pageview: false, // We manually capture pageviews in PostHogProvider
      capture_pageleave: true,
      autocapture: {
        dom_event_allowlist: ['click'],
        element_allowlist: ['button', 'a'],
      },
      loaded: instance => {
        if (process.env.NODE_ENV === 'development') {
          instance.debug();
        }
      },
    });
  }

  return posthog;
}

export { posthog };

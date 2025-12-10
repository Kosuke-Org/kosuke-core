import { posthog } from '@/lib/analytics/posthog';
import { useCallback } from 'react';

export interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Hook for tracking events with PostHog
 * Only captures events if PostHog has been initialized (which requires consent)
 */
export function usePostHog() {
  const capture = useCallback((eventName: string, properties?: EventProperties) => {
    if (!posthog?.__loaded) return;
    posthog.capture(eventName, properties);
  }, []);

  const identify = useCallback((userId: string, properties?: EventProperties) => {
    if (!posthog?.__loaded) return;
    posthog.identify(userId, properties);
  }, []);

  const reset = useCallback(() => {
    if (!posthog?.__loaded) return;
    posthog.reset();
  }, []);

  const featureEnabled = useCallback((featureFlagKey: string) => {
    if (!posthog?.__loaded) return false;
    return posthog.isFeatureEnabled(featureFlagKey);
  }, []);

  return {
    capture,
    identify,
    reset,
    featureEnabled,
    posthog,
  };
}

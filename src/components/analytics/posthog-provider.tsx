'use client';

import { hasStatisticsConsent, isCookiebotReady } from '@/lib/analytics/cookiebot';
import { initPostHog, posthog } from '@/lib/analytics/posthog';
import { useUser } from '@clerk/nextjs';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useState } from 'react';

interface PostHogProviderProps {
  children: ReactNode;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !posthog?.__loaded) return;

    let url = window.origin + pathname;
    if (searchParams && searchParams.toString()) {
      url = url + `?${searchParams.toString()}`;
    }

    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const { user, isLoaded } = useUser();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const tryInit = () => {
      if (hasStatisticsConsent()) {
        initPostHog();
        setInitialized(true);
      }
    };

    // Wait for Cookiebot to be ready before checking consent
    if (isCookiebotReady()) {
      tryInit();
    } else {
      window.addEventListener('CookiebotOnLoad', tryInit);
    }

    // Listen for consent acceptance
    const handleAccept = () => {
      if (hasStatisticsConsent()) {
        initPostHog();
        setInitialized(true);
      }
    };

    // Listen for consent decline/withdrawal
    const handleDecline = () => {
      if (posthog?.__loaded) {
        posthog.opt_out_capturing();
        setInitialized(false);
      }
    };

    window.addEventListener('CookiebotOnAccept', handleAccept);
    window.addEventListener('CookiebotOnDecline', handleDecline);

    return () => {
      window.removeEventListener('CookiebotOnLoad', tryInit);
      window.removeEventListener('CookiebotOnAccept', handleAccept);
      window.removeEventListener('CookiebotOnDecline', handleDecline);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !user || !initialized || !posthog?.__loaded) return;

    posthog.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
    });
  }, [user, isLoaded, initialized]);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}

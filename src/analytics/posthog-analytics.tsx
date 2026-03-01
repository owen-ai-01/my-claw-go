'use client';

import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, useState } from 'react';

/**
 * PostHog Analytics
 *
 * https://posthog.com
 * https://posthog.com/docs/libraries/next-js?tab=PostHog+provider
 * https://mksaas.com/docs/analytics#posthog
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const isProduction = process.env.NODE_ENV === 'production';
  const isPostHogEnabled = posthogKey && posthogHost && isProduction;

  const [posthogClient, setPosthogClient] = useState<any>(null);

  useEffect(() => {
    if (isPostHogEnabled) {
      import('posthog-js').then(({ default: posthog }) => {
        posthog.init(posthogKey, {
          api_host: posthogHost,
          defaults: '2025-05-24',
        });
        setPosthogClient(posthog);
      });
    }
  }, [isPostHogEnabled, posthogKey, posthogHost]);

  // If PostHog is not enabled, just return children without the provider
  if (!isPostHogEnabled) {
    return <>{children}</>;
  }

  // Only render provider once client is loaded
  if (!posthogClient) {
    return <>{children}</>;
  }

  return <PHProvider client={posthogClient}>{children}</PHProvider>;
}

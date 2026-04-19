'use client';

import {
  UTM_COOKIE_MAX_AGE,
  UTM_COOKIE_NAME,
  extractUtmSource,
} from '@/lib/utm';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Captures UTM / referral parameters from the current URL and persists them
 * in a first-touch cookie (never overwrites an existing value).
 *
 * Mount this once in the root layout so every page is covered.
 * Runs client-side only — no SSR impact.
 */
export function RootUtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Skip if the cookie is already set (first-touch attribution)
    if (
      document.cookie
        .split(';')
        .some((c) => c.trim().startsWith(`${UTM_COOKIE_NAME}=`))
    ) {
      return;
    }

    const utmSource = extractUtmSource(searchParams);
    if (!utmSource) return;

    const encoded = encodeURIComponent(utmSource);
    document.cookie = `${UTM_COOKIE_NAME}=${encoded}; path=/; max-age=${UTM_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, [searchParams]);

  return null;
}

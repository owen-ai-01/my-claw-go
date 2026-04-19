/**
 * UTM source tracking utilities
 *
 * Captures referral/attribution parameters from URLs and stores them
 * in a first-touch cookie, which is later written to user.utm_source on registration.
 */

/** Cookie name for storing the captured UTM source */
export const UTM_COOKIE_NAME = 'myclawgo_utm';

/** Cookie TTL: 30 days in seconds */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * URL parameter names to check, in priority order.
 * The first non-empty value wins.
 */
export const UTM_PARAM_KEYS = [
  'utm_source',
  'ref',
  'source',
  'from',
  'via',
  'r',
  'referrer',
  'referral',
  'aff',
  'invite',
] as const;

/**
 * Extracts the first non-empty attribution value from URLSearchParams.
 * Returns null if none of the known params are present.
 */
export function extractUtmSource(searchParams: URLSearchParams): string | null {
  for (const key of UTM_PARAM_KEYS) {
    const val = searchParams.get(key)?.trim();
    if (val) return val;
  }
  return null;
}

/**
 * Reads the UTM source value from a raw Cookie header string.
 * Returns null if the cookie is absent or empty.
 */
export function readUtmFromCookieHeader(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${UTM_COOKIE_NAME}=`));
  if (!match) return null;
  const val = decodeURIComponent(
    match.slice(UTM_COOKIE_NAME.length + 1)
  ).trim();
  return val || null;
}

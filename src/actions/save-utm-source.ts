'use server';

import { getDb } from '@/db';
import { user as userTable } from '@/db/schema';
import { getSession } from '@/lib/server';
import { readUtmFromCookieHeader } from '@/lib/utm';
import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';

/**
 * Writes the UTM source from the request cookie to user.utm_source,
 * but only if the field is currently NULL (first-touch attribution).
 *
 * Safe to call fire-and-forget — all errors are silently caught.
 */
export async function saveUtmSourceAction(): Promise<void> {
  try {
    const session = await getSession();
    if (!session?.user?.id) return;

    const reqHeaders = await headers();
    const utmSource = readUtmFromCookieHeader(reqHeaders.get('cookie'));
    if (!utmSource) return;

    const db = await getDb();
    await db
      .update(userTable)
      .set({ utmSource })
      .where(and(eq(userTable.id, session.user.id), isNull(userTable.utmSource)));
  } catch {
    // Never throw — this must not affect page rendering
  }
}

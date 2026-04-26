import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { runtimeAllocation } from '@/db/schema';

export async function resolveUserBridgeTarget(userId: string) {
  const db = await getDb();
  const [alloc] = await db
    .select()
    .from(runtimeAllocation)
    .where(and(eq(runtimeAllocation.userId, userId), eq(runtimeAllocation.status, 'ready')))
    .limit(1);

  if (!alloc?.bridgeBaseUrl || !alloc?.bridgeToken) {
    return {
      ok: false as const,
      code: 'runtime-not-ready',
      error: 'Runtime not ready',
    };
  }

  return {
    ok: true as const,
    userId,
    bridge: {
      baseUrl: alloc.bridgeBaseUrl,
      token: alloc.bridgeToken,
    },
  };
}

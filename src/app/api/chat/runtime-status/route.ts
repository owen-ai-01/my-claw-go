import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { runtimeAllocation } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const PROVISIONING_STATUSES = new Set(['pending', 'buying_vps', 'waiting_init']);

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb();
  const [alloc] = await db
    .select()
    .from(runtimeAllocation)
    .where(eq(runtimeAllocation.userId, userId))
    .limit(1);

  if (!alloc) {
    return NextResponse.json({ ok: true, state: 'not_created', reason: 'no-allocation' });
  }

  if (alloc.status === 'ready') {
    return NextResponse.json({ ok: true, state: 'ready', reason: 'runtime-available' });
  }
  if (alloc.status === 'stopped') {
    return NextResponse.json({ ok: true, state: 'stopped', reason: 'subscription-expired' });
  }
  if (alloc.status === 'failed') {
    return NextResponse.json({ ok: true, state: 'failed', reason: 'provision-failed' });
  }
  if (PROVISIONING_STATUSES.has(alloc.status)) {
    return NextResponse.json({ ok: true, state: 'provisioning', reason: alloc.status });
  }
  return NextResponse.json({ ok: true, state: 'provisioning', reason: alloc.status });
}

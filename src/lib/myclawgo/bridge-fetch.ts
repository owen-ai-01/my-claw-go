import { auth } from '@/lib/auth';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function requireUserBridgeTarget() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const target = await resolveUserBridgeTarget(userId);
  if (!target.ok) {
    return { ok: false as const, response: NextResponse.json(target, { status: 503 }) };
  }

  return { ok: true as const, userId, target };
}

export async function forwardBridgeGet(path: string) {
  const bridge = await requireUserBridgeTarget();
  if (!bridge.ok) return bridge.response;

  try {
    const upstream = await fetch(`${bridge.target.bridge.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${bridge.target.bridge.token}` },
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => ({ ok: false, error: 'Invalid bridge response' }));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'bridge_request_failed',
        error: error instanceof Error ? error.message : 'Bridge request failed',
      },
      { status: 502 }
    );
  }
}

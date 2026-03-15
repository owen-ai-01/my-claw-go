import { auth } from '@/lib/auth';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get('agentId') || 'main';
  const channel = url.searchParams.get('channel') || 'direct';
  const chatScope = url.searchParams.get('chatScope') || 'default';

  const target = await resolveUserBridgeTarget(userId);
  if (!target.ok) {
    return NextResponse.json(target, { status: 503 });
  }

  try {
    const upstream = await fetch(
      `${target.bridge.baseUrl}/chat/history?agentId=${encodeURIComponent(agentId)}&channel=${encodeURIComponent(channel)}&chatScope=${encodeURIComponent(chatScope)}`,
      {
        headers: { authorization: `Bearer ${target.bridge.token}` },
      }
    );
    const payload = await upstream.json().catch(() => ({ ok: false, error: 'Invalid bridge response' }));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'bridge-history-failed',
        error: error instanceof Error ? error.message : 'Bridge history failed',
      },
      { status: 502 }
    );
  }
}

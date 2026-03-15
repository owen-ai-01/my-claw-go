import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { userChatMessage } from '@/db/schema';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    agentId?: string;
    timeoutMs?: number;
  };

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const agentId = String(body.agentId || 'main');

  const target = await resolveUserBridgeTarget(userId);
  if (!target.ok) {
    return NextResponse.json(target, { status: 503 });
  }

  // Save user message to DB (best-effort, don't block on failure)
  const db = await getDb();
  const userMsgId = crypto.randomUUID();
  await db.insert(userChatMessage).values({
    id: userMsgId,
    userId,
    agentId,
    role: 'user',
    content: message,
  }).catch(() => null);

  try {
    const upstreamRes = await fetch(`${target.bridge.baseUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${target.bridge.token}`,
      },
      body: JSON.stringify({
        message,
        agentId,
        timeoutMs: body.timeoutMs || 90000,
      }),
    });

    const payload = await upstreamRes.json().catch(() => ({ ok: false, error: 'Invalid bridge response' }));

    // Save assistant reply to DB
    if (payload.ok === true && payload.data?.reply) {
      await db.insert(userChatMessage).values({
        id: crypto.randomUUID(),
        userId,
        agentId,
        role: 'assistant',
        content: payload.data.reply,
      }).catch(() => null);
    }

    return NextResponse.json(payload, { status: upstreamRes.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'bridge-request-failed',
        error: error instanceof Error ? error.message : 'Bridge request failed',
      },
      { status: 502 }
    );
  }
}

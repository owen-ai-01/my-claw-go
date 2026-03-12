import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendGatewayChatMessage } from '@/lib/myclawgo/gateway-chat';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 });
  }

  try {
    const data = await sendGatewayChatMessage(userId, message);
    return NextResponse.json({ ok: true, reply: data.reply, sessionKey: data.sessionKey });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to send gateway chat message',
      },
      { status: 500 }
    );
  }
}

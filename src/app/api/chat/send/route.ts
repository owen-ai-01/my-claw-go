import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      ok: false,
      code: 'legacy-chat-api-disabled',
      error: 'Legacy HTTP chat send endpoint is disabled. Use websocket gateway proxy flow via /api/chat/gateway-connection.',
    },
    { status: 410 }
  );
}

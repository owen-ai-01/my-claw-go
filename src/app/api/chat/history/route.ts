import { auth } from '@/lib/auth';
import { loadGatewayChatHistory } from '@/lib/myclawgo/gateway-chat';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const messages = await loadGatewayChatHistory(userId).catch(() => []);
  return NextResponse.json({ ok: true, messages });
}

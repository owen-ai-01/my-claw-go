import { auth } from '@/lib/auth';
import { getActiveChatAgent, setActiveChatAgent } from '@/lib/myclawgo/active-chat-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const agentId = await getActiveChatAgent(userId);
  return NextResponse.json({ ok: true, data: { agentId } });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { agentId?: string };
  const agentId = String(body.agentId || '').trim();
  await setActiveChatAgent(userId, agentId);
  return NextResponse.json({ ok: true });
}

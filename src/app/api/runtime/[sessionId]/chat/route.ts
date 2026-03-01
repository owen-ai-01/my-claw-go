import { NextResponse } from 'next/server';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { runOpenClawChatInContainer } from '@/lib/myclawgo/docker-manager';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  await touchSession(sessionId);

  const result = await runOpenClawChatInContainer(session, message);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    credits: session.credits,
  });
}

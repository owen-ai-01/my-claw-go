import { NextResponse } from 'next/server';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';

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

  // Placeholder for real OpenClaw-in-container call
  return NextResponse.json({
    ok: true,
    reply: `✅ Runtime is ready for session ${sessionId}. You said: ${message}`,
    credits: session.credits,
    note: 'Next step: wire this route to per-user containerized OpenClaw agent RPC.',
  });
}

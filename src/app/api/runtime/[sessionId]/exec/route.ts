import { NextResponse } from 'next/server';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { runWhitelistedCommandInContainer } from '@/lib/myclawgo/docker-manager';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const command = String(body?.command || '').trim();

  if (!command) {
    return NextResponse.json({ ok: false, error: 'Command is required' }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  await touchSession(sessionId);

  const result = await runWhitelistedCommandInContainer(session, command);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, container: session.containerName },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    output: result.output,
    container: session.containerName,
    sessionId,
  });
}

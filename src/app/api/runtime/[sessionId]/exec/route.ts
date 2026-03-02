import { runWhitelistedCommandInContainer } from '@/lib/myclawgo/docker-manager';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const command = String(body?.command || '').trim();

  if (!command) {
    return NextResponse.json(
      { ok: false, error: 'Command is required' },
      { status: 400 }
    );
  }

  if (command.length > 300) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Command is too long. Keep it under 300 characters.',
      },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Session not found' },
      { status: 404 }
    );
  }

  await touchSession(sessionId);

  try {
    const result = await runWhitelistedCommandInContainer(session, command);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, container: session.containerName },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      output: result.output,
      container: session.containerName,
      sessionId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal runtime error';
    return NextResponse.json(
      {
        ok: false,
        error: `Runtime execution failed: ${message}`,
        container: session.containerName,
      },
      { status: 500 }
    );
  }
}

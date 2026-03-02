import { auth } from '@/lib/auth';
import { runWhitelistedCommandInContainer } from '@/lib/myclawgo/docker-manager';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const authSession = await auth.api.getSession({ headers: await headers() });
  const currentUserId = authSession?.user?.id;

  if (!currentUserId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (currentUserId !== sessionId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Forbidden: session does not belong to current user',
      },
      { status: 403 }
    );
  }

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
    // Log error for monitoring
    console.error(
      `[MyClawGo Exec Error] session=${sessionId} container=${session.containerName} command=${command}`,
      error
    );
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

import { auth } from '@/lib/auth';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { ensureSessionById } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const runtimeSession = await ensureSessionById(userId, 'chat-create');
    const runtime = await ensureUserContainer(runtimeSession);

    if (!runtime.ok) {
      return NextResponse.json(
        { ok: false, error: runtime.error || 'Failed to create MyClawGo runtime' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      state: 'ready',
      containerName: runtimeSession.containerName,
      mode: runtime.mode,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

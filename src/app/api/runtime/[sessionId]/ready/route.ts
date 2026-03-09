import { auth } from '@/lib/auth';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { ensureSessionById } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (userId !== sessionId) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const runtimeSession = await ensureSessionById(userId, 'ready-check');
  const ensured = await ensureUserContainer(runtimeSession);

  if (!ensured.ok) {
    return NextResponse.json({
      ok: true,
      ready: false,
      phase: 'preparing',
      message:
        'Creating your workspace. Please wait about 1 minute, then chat will be ready automatically.',
    });
  }

  return NextResponse.json({ ok: true, ready: true, phase: 'ready' });
}

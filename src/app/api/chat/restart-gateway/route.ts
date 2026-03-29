import { auth } from '@/lib/auth';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const runtimeSession = await getSession(userId);
  if (!runtimeSession?.containerName) {
    return NextResponse.json({ ok: false, error: 'Runtime container not found' }, { status: 404 });
  }

  const containerName = runtimeSession.containerName;

  try {
    await execFileAsync('sg', [
      'docker',
      '-c',
      `docker exec --user openclaw ${containerName} bash -lc \"pkill -f 'openclaw gateway run|keep-gateway.sh' >/dev/null 2>&1 || true; nohup openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789 >/home/openclaw/.openclaw/gateway.log 2>&1 & sleep 1\"`,
    ], { timeout: 15000, maxBuffer: 1024 * 1024 });

    return NextResponse.json({ ok: true, data: { restarted: true } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to restart gateway',
      },
      { status: 500 }
    );
  }
}

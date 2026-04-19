import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { auth } from '@/lib/auth';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

async function dockerContainerExists(containerName: string) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps',
      '-a',
      '--format',
      '{{.Names}}',
    ]);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .includes(containerName);
  } catch {
    return false;
  }
}

async function runtimeLooksReady(userId: string) {
  const session = await getSession(userId);
  if (!session) {
    return {
      state: 'not_created' as const,
      reason: 'missing-session',
    };
  }

  try {
    await fs.access(`${session.userDataDir}/openclaw.json`);
  } catch {
    return {
      state: 'not_created' as const,
      reason: 'missing-config',
    };
  }

  const containerExists = await dockerContainerExists(session.containerName);
  if (!containerExists) {
    return {
      state: 'not_created' as const,
      reason: 'missing-container',
      containerName: session.containerName,
    };
  }

  return {
    state: 'ready' as const,
    reason: 'runtime-available',
    containerName: session.containerName,
  };
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const status = await runtimeLooksReady(userId);
  return NextResponse.json({ ok: true, ...status });
}

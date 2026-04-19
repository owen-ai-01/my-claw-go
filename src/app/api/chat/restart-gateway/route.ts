import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { auth } from '@/lib/auth';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

async function sanitizeOpenClawConfig(containerName: string) {
  const nodeScript =
    "const fs=require('fs');const p='/home/openclaw/.openclaw/openclaw.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.agents&&Array.isArray(j.agents.list)){j.agents.list=j.agents.list.map(a=>{if(a&&typeof a==='object'){delete a.role;delete a.description;delete a.department;delete a.enabled;if(a.identity&&a.identity.avatar) delete a.identity.avatar;}return a;});}fs.writeFileSync(p,JSON.stringify(j,null,2));";
  await execFileAsync(
    'docker',
    ['exec', '--user', 'openclaw', containerName, 'node', '-e', nodeScript],
    { timeout: 15000, maxBuffer: 1024 * 1024 }
  );
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );

  const runtimeSession = await getSession(userId);
  if (!runtimeSession?.containerName) {
    return NextResponse.json(
      { ok: false, error: 'Runtime container not found' },
      { status: 404 }
    );
  }

  const containerName = runtimeSession.containerName;

  try {
    await sanitizeOpenClawConfig(containerName);
    const restartScript = [
      'set -e',
      'if [ -x /home/openclaw/.openclaw/keep-gateway.sh ]; then',
      "  pkill -f 'openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789' >/dev/null 2>&1 || true",
      '  nohup /home/openclaw/.openclaw/keep-gateway.sh >/home/openclaw/.openclaw/gateway.log 2>&1 &',
      'else',
      "  pkill -f 'openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789' >/dev/null 2>&1 || true",
      '  nohup openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789 >/home/openclaw/.openclaw/gateway.log 2>&1 &',
      'fi',
      'sleep 1',
      'openclaw gateway call health --json >/dev/null 2>&1 || true',
    ].join('; ');

    const { stdout, stderr } = await execFileAsync(
      'docker',
      [
        'exec',
        '--user',
        'openclaw',
        containerName,
        'bash',
        '-lc',
        restartScript,
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 }
    );

    return NextResponse.json({
      ok: true,
      data: { restarted: true, stdout, stderr },
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'Failed to restart gateway';
    return NextResponse.json(
      {
        ok: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}

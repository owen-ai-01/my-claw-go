import { auth } from '@/lib/auth';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function dockerExec(containerName: string, cmd: string, timeoutMs = 10_000) {
  const { stdout } = await execFileAsync('sg', [
    'docker',
    '-c',
    `docker exec ${containerName} sh -lc '${cmd.replace(/'/g, `'\\''`)}'`,
  ], { maxBuffer: 2 * 1024 * 1024, timeout: timeoutMs });
  return stdout;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = req.nextUrl.searchParams.get('agentId') || 'main';
  const sessionKey = `agent:${agentId}:main`;

  const runtimeSession = await getSession(userId);
  if (!runtimeSession?.containerName) {
    return NextResponse.json({ ok: true, tokens: { input: 0, output: 0, total: 0 } });
  }

  try {
    const cmd = `su - openclaw -c 'openclaw gateway call chat.history --params "{\\"sessionKey\\":\\"${sessionKey}\\",\\"limit\\":200}" --json 2>/dev/null | head -n 2000'`;
    const stdout = await dockerExec(runtimeSession.containerName, cmd, 15_000);

    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;

    // Parse JSON from stdout (may have config warnings before it)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(stdout.slice(jsonStart));
        const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
        for (const msg of messages) {
          if (msg?.usage) {
            totalInput += Number(msg.usage.input || 0);
            totalOutput += Number(msg.usage.output || 0);
            totalTokens += Number(msg.usage.totalTokens || msg.usage.total || 0);
          }
        }
      } catch {
        // parse error — return 0
      }
    }

    return NextResponse.json({
      ok: true,
      tokens: {
        input: totalInput,
        output: totalOutput,
        total: totalTokens || (totalInput + totalOutput),
      },
    });
  } catch {
    return NextResponse.json({ ok: true, tokens: { input: 0, output: 0, total: 0 } });
  }
}

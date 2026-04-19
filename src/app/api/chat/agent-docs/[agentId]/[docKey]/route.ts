import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { auth } from '@/lib/auth';
import { requireUserBridgeTarget } from '@/lib/myclawgo/bridge-fetch';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

const DOC_FILE_MAP = {
  agents: 'AGENTS.md',
  identity: 'IDENTITY.md',
  user: 'USER.md',
  soul: 'SOUL.md',
  tools: 'TOOLS.md',
} as const;

type DocKey = keyof typeof DOC_FILE_MAP;

function isDocKey(v: string): v is DocKey {
  return v in DOC_FILE_MAP;
}

async function dockerExec(
  containerName: string,
  cmd: string,
  timeoutMs = 15_000
) {
  const { stdout } = await execFileAsync(
    'sg',
    [
      'docker',
      '-c',
      `docker exec --user openclaw ${containerName} bash -lc ${JSON.stringify(cmd)}`,
    ],
    { maxBuffer: 2 * 1024 * 1024, timeout: timeoutMs }
  );
  return stdout;
}

async function resolveAgentWorkspace(agentId: string): Promise<string> {
  const bridge = await requireUserBridgeTarget();
  if (!bridge.ok) throw new Error('Bridge unavailable');
  const res = await fetch(
    `${bridge.target.bridge.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    {
      headers: { authorization: `Bearer ${bridge.target.bridge.token}` },
      cache: 'no-store',
    }
  );
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: { workspace?: string };
  };
  if (!res.ok || payload.ok !== true || !payload.data?.workspace) {
    throw new Error('Agent workspace not found');
  }
  return payload.data.workspace;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string; docKey: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );

  const { agentId, docKey } = await params;
  if (!isDocKey(docKey))
    return NextResponse.json(
      { ok: false, error: 'Unsupported docKey' },
      { status: 400 }
    );

  const runtimeSession = await getSession(userId);
  if (!runtimeSession?.containerName) {
    return NextResponse.json(
      { ok: false, error: 'Runtime container not found' },
      { status: 404 }
    );
  }

  try {
    const workspace = await resolveAgentWorkspace(agentId);
    const docPath = path.posix.join(workspace, DOC_FILE_MAP[docKey]);
    const cmd = `if [ -f ${JSON.stringify(docPath)} ]; then cat ${JSON.stringify(docPath)}; else echo -n ''; fi`;
    const content = await dockerExec(runtimeSession.containerName, cmd);

    return NextResponse.json({
      ok: true,
      data: {
        agentId,
        docKey,
        path: docPath,
        content: content || '',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to read doc',
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ agentId: string; docKey: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );

  const { agentId, docKey } = await params;
  if (!isDocKey(docKey))
    return NextResponse.json(
      { ok: false, error: 'Unsupported docKey' },
      { status: 400 }
    );

  const runtimeSession = await getSession(userId);
  if (!runtimeSession?.containerName) {
    return NextResponse.json(
      { ok: false, error: 'Runtime container not found' },
      { status: 404 }
    );
  }

  const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB
  const WORKSPACE_PREFIX = '/home/openclaw/';

  try {
    const body = (await req.json().catch(() => ({}))) as { content?: string };
    const content = typeof body.content === 'string' ? body.content : '';
    if (Buffer.byteLength(content, 'utf8') > MAX_DOC_SIZE) {
      return NextResponse.json(
        { ok: false, error: 'Content too large (max 5MB)' },
        { status: 413 }
      );
    }
    const workspace = await resolveAgentWorkspace(agentId);
    if (!workspace.startsWith(WORKSPACE_PREFIX)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid workspace path' },
        { status: 400 }
      );
    }
    const docPath = path.posix.join(workspace, DOC_FILE_MAP[docKey]);
    const dirPath = path.posix.dirname(docPath);
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    const cmd = `mkdir -p ${JSON.stringify(dirPath)}; printf '%s' ${JSON.stringify(b64)} | base64 -d > ${JSON.stringify(docPath)}`;
    await dockerExec(runtimeSession.containerName, cmd);

    return NextResponse.json({
      ok: true,
      data: { agentId, docKey, path: docPath, updated: true },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to write doc',
      },
      { status: 500 }
    );
  }
}

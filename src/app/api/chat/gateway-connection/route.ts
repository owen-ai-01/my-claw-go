import fs from 'node:fs/promises';
import path from 'node:path';
import { auth } from '@/lib/auth';
import { issueChatProxyToken } from '@/lib/myclawgo/chat-proxy-token';
import { getSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

function inferBaseUrl(requestHeaders: Headers) {
  const forwardedProto = requestHeaders.get('x-forwarded-proto') || 'http';
  const forwardedHost =
    requestHeaders.get('x-forwarded-host') ||
    requestHeaders.get('host') ||
    '127.0.0.1:3000';
  return `${forwardedProto}://${forwardedHost}`;
}

async function loadGatewayAuthToken(userDataDir: string) {
  try {
    const configPath = path.join(userDataDir, 'openclaw.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const json = JSON.parse(raw) as { gateway?: { auth?: { token?: string } } };
    return json?.gateway?.auth?.token || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const runtimeSession = await getSession(userId);
  if (!runtimeSession) {
    return NextResponse.json(
      { ok: false, error: 'Runtime session not found' },
      { status: 404 }
    );
  }

  const baseUrl = inferBaseUrl(reqHeaders);
  const wsBaseUrl =
    process.env.MYCLAWGO_CHAT_PROXY_WS_BASE_URL ||
    baseUrl.replace(/^http/, 'ws');

  const token = issueChatProxyToken(userId);
  const wsUrl = `${wsBaseUrl}/api/chat/gateway-proxy?token=${encodeURIComponent(token)}`;
  const httpUrl = wsUrl.replace(/^ws/, 'http');
  const gatewayAuthToken = await loadGatewayAuthToken(
    runtimeSession.userDataDir
  );

  return NextResponse.json({
    ok: true,
    userId,
    containerName: runtimeSession.containerName,
    gateway: {
      transport: 'websocket-proxy',
      wsUrl,
      httpUrl,
      sessionKey: 'agent:main:main',
      authToken: gatewayAuthToken,
      note: 'WebSocket proxy target for the user Docker OpenClaw gateway.',
    },
  });
}

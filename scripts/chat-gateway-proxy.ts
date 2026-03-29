import { createServer, type IncomingMessage } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { verifyChatProxyToken } from '../src/lib/myclawgo/chat-proxy-token';
import { getSession } from '../src/lib/myclawgo/session-store';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.MYCLAWGO_CHAT_PROXY_PORT || 3020);
const PATHNAME = process.env.MYCLAWGO_CHAT_PROXY_PATH || '/api/chat/gateway-proxy';

async function ensureGatewayForContainer(containerName: string) {
  const scriptContent = [
    '#!/bin/bash',
    'while true; do',
    '  openclaw gateway run --allow-unconfigured --auth none --bind lan --port 18789 >> /home/openclaw/.openclaw/gateway.log 2>&1',
    '  sleep 2',
    'done',
  ].join('\n');

  await execFileAsync('docker', [
    'exec',
    '--user',
    'openclaw',
    containerName,
    'bash',
    '-c',
    `printf '%s' ${JSON.stringify(scriptContent)} > /home/openclaw/.openclaw/keep-gateway.sh && chmod +x /home/openclaw/.openclaw/keep-gateway.sh`,
  ]).catch(() => null);

  await execFileAsync('docker', [
    'exec',
    '--user',
    'openclaw',
    containerName,
    'bash',
    '-c',
    "pkill -f 'keep-gateway.sh|openclaw gateway run' >/dev/null 2>&1 || true",
  ]).catch(() => null);

  const running = await execFileAsync('docker', [
    'exec',
    '--user',
    'openclaw',
    containerName,
    'bash',
    '-c',
    'pgrep -f keep-gateway.sh >/dev/null 2>&1 && echo yes || echo no',
  ])
    .then(({ stdout }) => stdout.trim() === 'yes')
    .catch(() => false);

  if (!running) {
    await execFileAsync('docker', [
      'exec',
      '-d',
      '--user',
      'openclaw',
      containerName,
      'bash',
      '/home/openclaw/.openclaw/keep-gateway.sh',
    ]).catch(() => null);
  }
}

async function getContainerGatewayWsUrl(containerName: string) {
  await execFileAsync('docker', ['start', containerName]).catch(() => null);
  await ensureGatewayForContainer(containerName).catch(() => null);

  const { stdout } = await execFileAsync('docker', [
    'inspect',
    '-f',
    '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    containerName,
  ]);
  const ip = stdout.trim();
  if (!ip) {
    throw new Error(`Container ${containerName} has no bridge IP`);
  }
  return `ws://${ip}:18789`;
}

async function waitForGatewayHealth(containerName: string, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const healthy = await execFileAsync('docker', [
      'exec',
      '--user',
      'openclaw',
      containerName,
      'bash',
      '-lc',
      "openclaw gateway call health --json 2>/dev/null | head -1",
    ])
      .then(({ stdout }) => stdout.includes('{'))
      .catch(() => false);

    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'chat-gateway-proxy' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs: WebSocket, _req: IncomingMessage, ctx: { upstreamWs: WebSocket }) => {
  const upstreamWs = ctx.upstreamWs;

  const closeBoth = () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.close();
  };

  clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    }
  });

  upstreamWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', closeBoth);
  upstreamWs.on('close', closeBoth);
  clientWs.on('error', closeBoth);
  upstreamWs.on('error', closeBoth);
});

server.on('upgrade', async (req, socket, head) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[chat-gateway-proxy] upgrade request', req.url || '');
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== PATHNAME) {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token') || '';
    const tokenPayload = verifyChatProxyToken(token);
    if (!tokenPayload?.userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // eslint-disable-next-line no-console
    console.log('[chat-gateway-proxy] token ok for user', tokenPayload.userId);

    const runtimeSession = await getSession(tokenPayload.userId);
    if (!runtimeSession?.containerName) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const upstreamReady = await waitForGatewayHealth(runtimeSession.containerName, 12);
    if (!upstreamReady) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    const upstreamUrl = await getContainerGatewayWsUrl(runtimeSession.containerName);
    const upstreamWs = new WebSocket(upstreamUrl);

    upstreamWs.once('open', () => {
      // eslint-disable-next-line no-console
      console.log('[chat-gateway-proxy] upstream connected for user', tokenPayload.userId);
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, req, { upstreamWs });
      });
    });

    upstreamWs.once('error', (error) => {
      // eslint-disable-next-line no-console
      console.error('[chat-gateway-proxy] upstream websocket error', error);
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[chat-gateway-proxy] upgrade error', error);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[chat-gateway-proxy] listening on ws://127.0.0.1:${PORT}${PATHNAME}`);
});

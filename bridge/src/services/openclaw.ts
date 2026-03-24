import fs from 'node:fs/promises';
import { createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { appendChatTranscript } from './chat-store.js';
import { BridgeError } from '../lib/errors.js';

const OPENCLAW_HOME = '/home/openclaw/.openclaw';
const OPENCLAW_CONFIG_PATH = `${OPENCLAW_HOME}/openclaw.json`;
const OPENCLAW_DEVICE_PATH = `${OPENCLAW_HOME}/identity/device.json`;
const GATEWAY_WS_URL = 'ws://127.0.0.1:18789';
const GATEWAY_HEALTH_URL = 'http://127.0.0.1:18789/health';
const GATEWAY_CLIENT_ID = 'cli';
const GATEWAY_CLIENT_MODE = 'cli';
const GATEWAY_ROLE = 'operator';
const GATEWAY_SCOPES = ['operator.admin'];
const GATEWAY_PROTOCOL = 3;

const require = createRequire(import.meta.url);
// Reuse the ws package bundled with openclaw runtime inside the container.
// At runtime this file exists; at build time TypeScript treats it as any.
const WS = require('/usr/local/lib/node_modules/openclaw/node_modules/ws/index.js');

type RuntimeConfig = {
  gateway?: {
    auth?: {
      token?: string;
    };
  };
};

type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

type ChatHistoryMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  text?: string;
  provider?: string;
  model?: string;
  usage?: Record<string, any>;
  timestamp?: number;
};

type GatewayConnectPayload = {
  type?: string;
  protocol?: number;
  features?: {
    methods?: string[];
  };
};

type ChatSendStartedPayload = {
  runId: string;
  status: string;
};

type AgentWaitPayload = {
  runId: string;
  status: string;
  endedAt?: number;
};

type ChatHistoryPayload = {
  sessionKey?: string;
  sessionId?: string;
  messages?: ChatHistoryMessage[];
};

type GatewayTiming = {
  connectMs: number;
  chatSendMs: number;
  agentWaitMs: number;
  chatHistoryMs: number;
  totalGatewayMs: number;
};

function b64url(buf: Buffer) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string) {
  const keyObj = createPublicKey(publicKeyPem);
  const der = keyObj.export({ type: 'spki', format: 'der' }) as Buffer;
  return b64url(Buffer.from(der).subarray(-32));
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily?: string;
}) {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token,
    params.nonce,
    params.platform,
    params.deviceFamily ?? '',
  ].join('|');
}

function signDevicePayload(privateKeyPem: string, payload: string) {
  const key = createPrivateKey(privateKeyPem);
  return b64url(sign(null, Buffer.from(payload, 'utf8'), key));
}

function extractReply(parsed: any) {
  if (typeof parsed?.reply === 'string' && parsed.reply.trim()) return parsed.reply;
  const payloads = parsed?.payloads ?? parsed?.result?.payloads;
  if (Array.isArray(payloads)) {
    return payloads.map((item: any) => item?.text || '').filter(Boolean).join('\n\n').trim();
  }
  if (typeof parsed?.raw === 'string') return parsed.raw;
  return '';
}

function extractTextFromHistoryMessage(message: ChatHistoryMessage | undefined) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => part?.text || '').join('\n').trim();
  }
  if (typeof message.text === 'string') return message.text;
  return '';
}

async function loadGatewayRuntimeAuth() {
  const [cfgRaw, deviceRaw] = await Promise.all([
    fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8'),
    fs.readFile(OPENCLAW_DEVICE_PATH, 'utf8'),
  ]);
  const cfg = JSON.parse(cfgRaw) as RuntimeConfig;
  const device = JSON.parse(deviceRaw) as DeviceIdentity;
  const token = cfg.gateway?.auth?.token?.trim();
  if (!token) throw new BridgeError('OPENCLAW_NOT_READY', 'Gateway auth token missing', 503);
  if (!device?.deviceId || !device?.publicKeyPem || !device?.privateKeyPem) {
    throw new BridgeError('OPENCLAW_NOT_READY', 'Gateway device identity missing', 503);
  }
  return { token, device };
}

async function openGatewaySession(timeoutMs: number) {
  const { token, device } = await loadGatewayRuntimeAuth();
  const ws = new WS(GATEWAY_WS_URL);
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>();
  let settled = false;

  const cleanup = () => {
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    pending.clear();
    try { ws.close(); } catch {}
  };

  const rejectAll = (error: Error) => {
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };

  const sendReq = <T = any>(method: string, params?: unknown, reqTimeoutMs = timeoutMs): Promise<T> => {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new BridgeError('OPENCLAW_TIMEOUT', `Gateway request timed out: ${method}`, 504));
      }, reqTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  };

  const ready = new Promise<void>((resolve, reject) => {
    const initTimer = setTimeout(() => {
      reject(new BridgeError('OPENCLAW_TIMEOUT', 'Gateway connect timed out', 504));
      cleanup();
    }, Math.min(timeoutMs, 15000));

    ws.on('open', () => {
      // Wait for connect.challenge event.
    });

    ws.on('message', async (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = typeof msg.payload?.nonce === 'string' ? msg.payload.nonce : '';
          if (!nonce) throw new BridgeError('OPENCLAW_NOT_READY', 'Gateway connect challenge missing nonce', 503);
          const signedAtMs = Date.now();
          const platform = process.platform;
          const devicePayload = buildDeviceAuthPayloadV3({
            deviceId: device.deviceId,
            clientId: GATEWAY_CLIENT_ID,
            clientMode: GATEWAY_CLIENT_MODE,
            role: GATEWAY_ROLE,
            scopes: GATEWAY_SCOPES,
            signedAtMs,
            token,
            nonce,
            platform,
          });

          const hello = await sendReq<GatewayConnectPayload>('connect', {
            minProtocol: GATEWAY_PROTOCOL,
            maxProtocol: GATEWAY_PROTOCOL,
            client: {
              id: GATEWAY_CLIENT_ID,
              version: '1.0.0',
              platform,
              mode: GATEWAY_CLIENT_MODE,
              instanceId: randomUUID(),
            },
            caps: [],
            auth: { token },
            role: GATEWAY_ROLE,
            scopes: GATEWAY_SCOPES,
            device: {
              id: device.deviceId,
              publicKey: publicKeyRawBase64UrlFromPem(device.publicKeyPem),
              signature: signDevicePayload(device.privateKeyPem, devicePayload),
              signedAt: signedAtMs,
              nonce,
            },
          }, Math.min(timeoutMs, 15000));

          if (hello?.type !== 'hello-ok' && hello?.protocol !== GATEWAY_PROTOCOL) {
            throw new BridgeError('OPENCLAW_NOT_READY', 'Gateway connect failed', 503);
          }
          if (!settled) {
            settled = true;
            clearTimeout(initTimer);
            resolve();
          }
          return;
        }

        if (msg.type === 'res') {
          const entry = pending.get(msg.id);
          if (!entry) return;
          pending.delete(msg.id);
          if (entry.timer) clearTimeout(entry.timer);
          if (msg.ok) entry.resolve(msg.payload);
          else entry.reject(new BridgeError('OPENCLAW_GATEWAY_ERROR', msg.error?.message || 'Gateway request failed', 502));
          return;
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(initTimer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        rejectAll(error instanceof Error ? error : new Error(String(error)));
        cleanup();
      }
    });

    ws.on('error', (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(initTimer);
        reject(error);
      }
      rejectAll(error);
      cleanup();
    });

    ws.on('close', (code: number, reason: Buffer | string) => {
      const reasonText = typeof reason === 'string' ? reason : reason?.toString?.() || '';
      if (!settled) {
        settled = true;
        clearTimeout(initTimer);
        reject(new BridgeError('OPENCLAW_GATEWAY_ERROR', `Gateway closed (${code}): ${reasonText}`, 502));
      }
      rejectAll(new BridgeError('OPENCLAW_GATEWAY_ERROR', `Gateway closed (${code}): ${reasonText}`, 502));
    });
  });

  await ready;

  return {
    sendReq,
    close: cleanup,
  };
}

async function sendChatViaGateway(params: {
  message: string;
  agentId: string;
  timeoutMs: number;
}) {
  const sessionKey = `agent:${params.agentId}:main`;
  const gatewayStartAt = Date.now();
  const gateway = await openGatewaySession(Math.max(params.timeoutMs, 65000));
  const connectMs = Date.now() - gatewayStartAt;
  try {
    const chatSendStartedAt = Date.now();
    const started = await gateway.sendReq<ChatSendStartedPayload>('chat.send', {
      sessionKey,
      message: params.message,
      thinking: 'off',
      deliver: false,
      idempotencyKey: randomUUID(),
      timeoutMs: params.timeoutMs,
    }, params.timeoutMs + 5000);
    const chatSendMs = Date.now() - chatSendStartedAt;

    if (!started?.runId) {
      throw new BridgeError('OPENCLAW_GATEWAY_ERROR', 'Gateway chat.send did not return runId', 502);
    }

    const agentWaitStartedAt = Date.now();
    const waitResult = await gateway.sendReq<AgentWaitPayload>('agent.wait', {
      runId: started.runId,
      timeoutMs: params.timeoutMs,
    }, params.timeoutMs + 5000);
    const agentWaitMs = Date.now() - agentWaitStartedAt;

    if (waitResult?.status !== 'ok') {
      throw new BridgeError('OPENCLAW_GATEWAY_ERROR', `Gateway run did not complete successfully: ${waitResult?.status || 'unknown'}`, 502);
    }

    const chatHistoryStartedAt = Date.now();
    const history = await gateway.sendReq<ChatHistoryPayload>('chat.history', {
      sessionKey,
      limit: 30,
    }, 10000);
    const chatHistoryMs = Date.now() - chatHistoryStartedAt;

    const messages = Array.isArray(history?.messages) ? history.messages : [];
    const assistant = [...messages].reverse().find((message) => message?.role === 'assistant');
    const reply = extractTextFromHistoryMessage(assistant);
    if (!reply.trim()) {
      throw new BridgeError('OPENCLAW_GATEWAY_ERROR', 'Gateway returned no assistant reply', 502);
    }

    const timing: GatewayTiming = {
      connectMs,
      chatSendMs,
      agentWaitMs,
      chatHistoryMs,
      totalGatewayMs: connectMs + chatSendMs + agentWaitMs + chatHistoryMs,
    };

    console.info(
      `[bridge/openclaw timing] agent=${params.agentId}` +
      ` connectMs=${timing.connectMs}` +
      ` chatSendMs=${timing.chatSendMs}` +
      ` agentWaitMs=${timing.agentWaitMs}` +
      ` chatHistoryMs=${timing.chatHistoryMs}` +
      ` totalGatewayMs=${timing.totalGatewayMs}`
    );

    return {
      raw: assistant,
      reply,
      model: assistant?.model,
      usage: assistant?.usage,
      timing,
    };
  } finally {
    gateway.close();
  }
}

export async function checkOpenClawHealth() {
  const res = await fetch(GATEWAY_HEALTH_URL);
  if (!res.ok) {
    throw new BridgeError('OPENCLAW_NOT_READY', `OpenClaw health check failed: HTTP ${res.status}`, 503);
  }
  try {
    return await res.json();
  } catch {
    throw new BridgeError('OPENCLAW_NOT_READY', 'OpenClaw health check returned invalid JSON', 503);
  }
}

export async function sendChatMessage(params: {
  message: string;
  agentId: string;
  timeoutMs?: number;
  channel?: string;
  chatScope?: string;
}) {
  const { message, agentId, timeoutMs = 90000, channel = 'direct', chatScope = 'default' } = params;

  try {
    const result = await sendChatViaGateway({ message, agentId, timeoutMs });
    await appendChatTranscript({ role: 'user', text: message, agentId, channel, chatScope });
    await appendChatTranscript({ role: 'assistant', text: result.reply || '', agentId, channel, chatScope, meta: { model: result.model } });
    return result;
  } catch (error) {
    const errText = error instanceof Error ? error.message : String(error);
    await appendChatTranscript({ role: 'user', text: message, agentId, channel, chatScope });
    await appendChatTranscript({ role: 'assistant', text: errText.trim(), agentId, channel, chatScope });
    throw error;
  }
}

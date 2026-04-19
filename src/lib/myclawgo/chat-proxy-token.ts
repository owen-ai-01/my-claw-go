import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 5 * 60;

function getSecret() {
  return (
    process.env.MYCLAWGO_CHAT_PROXY_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    'myclawgo-chat-proxy-dev-secret'
  );
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payloadB64: string) {
  return base64UrlEncode(
    crypto.createHmac('sha256', getSecret()).update(payloadB64).digest()
  );
}

export function issueChatProxyToken(
  userId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId,
    iat: now,
    exp: now + Math.max(30, ttlSeconds),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signatureB64 = signPayload(payloadB64);
  return `${payloadB64}.${signatureB64}`;
}

export function verifyChatProxyToken(token: string) {
  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) return null;

  const expected = signPayload(payloadB64);
  const a = Buffer.from(signatureB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as {
      userId?: string;
      exp?: number;
      iat?: number;
    };
    if (!payload?.userId || !payload?.exp) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

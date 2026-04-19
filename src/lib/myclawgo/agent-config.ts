import crypto from 'node:crypto';
import { getDb } from '@/db';
import { userAgent, userAgentTelegramBot } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

function getEncryptionSecret(): string {
  const secret =
    process.env.MYCLAWGO_CONFIG_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      '[FATAL] No encryption secret configured. Set MYCLAWGO_CONFIG_SECRET (or BETTER_AUTH_SECRET / AUTH_SECRET) in your environment.'
    );
  }
  return secret;
}

export function encryptConfigValue(value: string) {
  const secret = crypto
    .createHash('sha256')
    .update(getEncryptionSecret())
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptConfigValue(payload: string) {
  const secret = crypto
    .createHash('sha256')
    .update(getEncryptionSecret())
    .digest();
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', secret, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export async function ensureMainAgent(userId: string) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(userAgent)
    .where(and(eq(userAgent.userId, userId), eq(userAgent.agentKey, 'main')))
    .limit(1);

  if (existing[0]) return existing[0];

  const now = new Date();
  const id = crypto.randomUUID();
  const created = {
    id,
    userId,
    agentKey: 'main',
    name: 'Main Agent',
    slug: 'main',
    description: 'Primary assistant for the user workspace.',
    status: 'active',
    isDefault: true,
    runtimeAgentId: 'main',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(userAgent).values(created);
  return created;
}

export async function getMainAgentTelegramBot(userId: string) {
  const db = await getDb();
  const mainAgent = await ensureMainAgent(userId);
  const existing = await db
    .select()
    .from(userAgentTelegramBot)
    .where(eq(userAgentTelegramBot.userAgentId, mainAgent.id))
    .limit(1);
  return { mainAgent, bot: existing[0] || null };
}

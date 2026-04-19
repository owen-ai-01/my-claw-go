import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/db';
import { userAgentTelegramBot } from '@/db/schema';
import {
  decryptConfigValue,
  ensureMainAgent,
  getMainAgentTelegramBot,
} from '@/lib/myclawgo/agent-config';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { ensureSessionById } from '@/lib/myclawgo/session-store';
import { eq } from 'drizzle-orm';

const HOST_OPENCLAW_CONFIG =
  process.env.MYCLAWGO_SEED_CONFIG_PATH ||
  '/home/openclaw/docker-openclaw-seed/openclaw.json';

function deepMerge<T extends Record<string, any>>(
  base: T,
  patch: Record<string, any>
): T {
  const out: Record<string, any> = Array.isArray(base)
    ? [...base]
    : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const prev = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev)
    ) {
      out[key] = deepMerge(prev, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

async function readSeedConfig() {
  const raw = await fs.readFile(HOST_OPENCLAW_CONFIG, 'utf8');
  return JSON.parse(raw) as Record<string, any>;
}

export async function applyMainAgentTelegramConfigToRuntime(userId: string) {
  const db = await getDb();
  const mainAgent = await ensureMainAgent(userId);
  const { bot } = await getMainAgentTelegramBot(userId);

  const runtimeSession = await ensureSessionById(userId, 'runtime-config-sync');
  await fs.mkdir(runtimeSession.userDataDir, { recursive: true });

  const targetConfigPath = path.join(
    runtimeSession.userDataDir,
    'openclaw.json'
  );
  const backupPath = `${targetConfigPath}.bak`;

  const seedConfig = await readSeedConfig();
  let currentConfig = seedConfig;
  try {
    const existing = await fs.readFile(targetConfigPath, 'utf8');
    currentConfig = JSON.parse(existing);
  } catch {
    // fall back to seed config
  }

  let patch: Record<string, any> = {
    agents: {
      list: [
        {
          id: mainAgent.runtimeAgentId,
          label: mainAgent.name,
        },
      ],
    },
    myclawgo: {
      agentBindings: {
        [mainAgent.runtimeAgentId]: {
          managedBy: 'myclawgo',
          updatedAt: new Date().toISOString(),
        },
      },
    },
  };

  if (bot?.botTokenEncrypted) {
    const accountId = `agent_${mainAgent.runtimeAgentId}`;
    const botToken = decryptConfigValue(bot.botTokenEncrypted);
    patch = deepMerge(patch, {
      channels: {
        telegram: {
          enabled: true,
          defaultAccount: accountId,
          dmPolicy: 'open',
          allowFrom: ['*'],
          accounts: {
            [accountId]: {
              enabled: true,
              botToken,
              dmPolicy: 'open',
              allowFrom: ['*'],
            },
          },
        },
      },
      bindings: [
        {
          agentId: mainAgent.runtimeAgentId,
          match: {
            channel: 'telegram',
            accountId,
          },
        },
      ],
      myclawgo: {
        agentBindings: {
          [mainAgent.runtimeAgentId]: {
            telegram: {
              configured: true,
              accountId,
              botUsername: bot.botUsername,
              botTelegramId: bot.botTelegramId,
              webhookPath: bot.webhookPath,
            },
          },
        },
      },
    });
  }

  const nextConfig = deepMerge(currentConfig, patch);

  try {
    const existing = await fs.readFile(targetConfigPath, 'utf8');
    await fs.writeFile(backupPath, existing, 'utf8');
  } catch {
    // ignore missing existing file
  }

  await fs.writeFile(
    targetConfigPath,
    `${JSON.stringify(nextConfig, null, 2)}\n`,
    {
      mode: 0o600,
    }
  );

  const ensured = await ensureUserContainer(runtimeSession);
  if (!ensured.ok) {
    return {
      ok: false as const,
      error: ensured.error,
      configPath: targetConfigPath,
    };
  }

  const now = new Date();
  if (bot) {
    await db
      .update(userAgentTelegramBot)
      .set({
        lastError: null,
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(userAgentTelegramBot.id, bot.id));
  }

  return {
    ok: true as const,
    userId,
    runtimeAgentId: mainAgent.runtimeAgentId,
    configPath: targetConfigPath,
    containerName: runtimeSession.containerName,
    syncedTelegram: Boolean(bot?.botTokenEncrypted),
  };
}

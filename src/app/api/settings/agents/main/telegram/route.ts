import crypto from 'node:crypto';
import { getDb } from '@/db';
import { userAgentTelegramBot } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  encryptConfigValue,
  getMainAgentTelegramBot,
} from '@/lib/myclawgo/agent-config';
import { eq } from 'drizzle-orm';
import { applyMainAgentTelegramConfigToRuntime } from '@/lib/myclawgo/runtime-agent-sync';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

async function verifyTelegramBotToken(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    method: 'GET',
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: { id?: number | string; username?: string; first_name?: string };
    description?: string;
  };

  if (!res.ok || !data?.ok || !data?.result?.id) {
    throw new Error(data?.description || 'Failed to verify Telegram bot token');
  }

  return {
    botTelegramId: String(data.result.id),
    botUsername: data.result.username || '',
    displayName: data.result.first_name || 'Telegram Bot',
  };
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { mainAgent, bot } = await getMainAgentTelegramBot(userId);

  return NextResponse.json({
    ok: true,
    agent: {
      id: mainAgent.id,
      key: mainAgent.agentKey,
      name: mainAgent.name,
      runtimeAgentId: mainAgent.runtimeAgentId,
    },
    telegramBot: bot
      ? {
          id: bot.id,
          status: bot.status,
          botUsername: bot.botUsername,
          botTelegramId: bot.botTelegramId,
          lastVerifiedAt: bot.lastVerifiedAt,
          lastError: bot.lastError,
          configured: Boolean(bot.botTokenEncrypted),
        }
      : null,
  });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const botToken = String(body?.botToken || '').trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Telegram bot token is required' }, { status: 400 });
  }

  try {
    const verified = await verifyTelegramBotToken(botToken);
    const db = await getDb();
    const { mainAgent, bot } = await getMainAgentTelegramBot(userId);
    const now = new Date();
    const encryptedToken = encryptConfigValue(botToken);

    // Generate a fresh webhook secret on every save so the receiver can always validate.
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    if (bot) {
      await db
        .update(userAgentTelegramBot)
        .set({
          status: 'active',
          botTokenEncrypted: encryptedToken,
          botUsername: verified.botUsername,
          botTelegramId: verified.botTelegramId,
          webhookPath: null,
          webhookSecret,
          lastVerifiedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(userAgentTelegramBot.id, bot.id));
    } else {
      await db.insert(userAgentTelegramBot).values({
        id: crypto.randomUUID(),
        userId,
        userAgentId: mainAgent.id,
        status: 'active',
        botTokenEncrypted: encryptedToken,
        botUsername: verified.botUsername,
        botTelegramId: verified.botTelegramId,
        webhookSecret,
        lastVerifiedAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const syncResult = await applyMainAgentTelegramConfigToRuntime(userId);

    return NextResponse.json({
      ok: true,
      message: 'Telegram bot configuration saved',
      agent: {
        id: mainAgent.id,
        key: mainAgent.agentKey,
        name: mainAgent.name,
      },
      telegramBot: {
        botUsername: verified.botUsername,
        botTelegramId: verified.botTelegramId,
        verifiedAt: now.toISOString(),
      },
      runtimeSync: syncResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to save Telegram bot config',
      },
      { status: 400 }
    );
  }
}

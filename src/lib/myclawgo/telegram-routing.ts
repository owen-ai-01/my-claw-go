import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  userAgent,
  userAgentTelegramBot,
  userChannelBinding,
} from '@/db/schema';

export async function findTelegramBotRoute(userId: string, agentId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      agent: userAgent,
      bot: userAgentTelegramBot,
    })
    .from(userAgentTelegramBot)
    .innerJoin(userAgent, eq(userAgentTelegramBot.userAgentId, userAgent.id))
    .where(
      and(
        eq(userAgentTelegramBot.userId, userId),
        eq(userAgentTelegramBot.userAgentId, agentId)
      )
    )
    .limit(1);

  return rows[0] || null;
}

export async function upsertTelegramChannelBinding(params: {
  userId: string;
  userAgentId: string;
  telegramBotId: string;
  chatId: string;
  telegramUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
}) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(userChannelBinding)
    .where(
      and(
        eq(userChannelBinding.telegramBotId, params.telegramBotId),
        eq(userChannelBinding.externalChatId, params.chatId)
      )
    )
    .limit(1);

  const now = new Date();
  if (existing[0]) {
    await db
      .update(userChannelBinding)
      .set({
        status: 'connected',
        externalUserId: params.telegramUserId || existing[0].externalUserId,
        externalUsername: params.username || existing[0].externalUsername,
        externalDisplayName:
          params.displayName || existing[0].externalDisplayName,
        connectedAt: existing[0].connectedAt || now,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(userChannelBinding.id, existing[0].id));
    return existing[0].id;
  }

  const id = crypto.randomUUID();
  await db.insert(userChannelBinding).values({
    id,
    userId: params.userId,
    userAgentId: params.userAgentId,
    telegramBotId: params.telegramBotId,
    channel: 'telegram',
    status: 'connected',
    externalChatId: params.chatId,
    externalUserId: params.telegramUserId || null,
    externalUsername: params.username || null,
    externalDisplayName: params.displayName || null,
    connectedAt: now,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

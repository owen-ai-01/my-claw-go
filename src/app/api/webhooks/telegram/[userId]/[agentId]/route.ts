import { findTelegramBotRoute, upsertTelegramChannelBinding } from '@/lib/myclawgo/telegram-routing';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string; agentId: string }> }
) {
  const { userId, agentId } = await params;
  const route = await findTelegramBotRoute(userId, agentId);
  if (!route?.bot || !route?.agent) {
    return NextResponse.json({ ok: false, error: 'Telegram bot route not found' }, { status: 404 });
  }

  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!route.bot.webhookSecret) {
    // Webhook secret not configured — reject to prevent unauthenticated message injection.
    // Re-register the bot via Settings to generate a secret.
    return NextResponse.json({ ok: false, error: 'Webhook secret not configured. Please re-register your Telegram bot.' }, { status: 401 });
  }
  if (secret !== route.bot.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook secret' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = body?.message || body?.edited_message;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const fromId = message?.from?.id ? String(message.from.id) : null;
  const username = message?.from?.username ? String(message.from.username) : null;
  const displayName = [message?.from?.first_name, message?.from?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || null;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  if (chatId) {
    await upsertTelegramChannelBinding({
      userId: route.agent.userId,
      userAgentId: route.agent.id,
      telegramBotId: route.bot.id,
      chatId,
      telegramUserId: fromId,
      username,
      displayName,
    });
  }

  return NextResponse.json({
    ok: true,
    routed: {
      userId: route.agent.userId,
      userAgentId: route.agent.id,
      runtimeAgentId: route.agent.runtimeAgentId,
      botId: route.bot.id,
      botUsername: route.bot.botUsername,
      chatId,
      text,
    },
    next: 'telegram-message-routing',
  });
}

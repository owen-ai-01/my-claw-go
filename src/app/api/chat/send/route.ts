import { auth } from '@/lib/auth';
import { checkUserCredits } from '@/lib/myclawgo/membership';
import { createDirectChatTask } from '@/lib/myclawgo/user-chat';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const MIN_CREDITS_PER_MESSAGE = 1;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    agentId?: string;
    timeoutMs?: number;
  };

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const agentId = String(body.agentId || 'main');

  const creditCheck = await checkUserCredits(userId, MIN_CREDITS_PER_MESSAGE);
  if (!creditCheck.hasCredits) {
    return NextResponse.json(
      {
        ok: false,
        code: 'insufficient_credits',
        error: 'Insufficient credits. Please top up to continue chatting.',
        balance: creditCheck.balance,
      },
      { status: 402 }
    );
  }

  try {
    const task = await createDirectChatTask({
      userId,
      agentId,
      message,
      timeoutMs: body.timeoutMs || 180000,
    });

    return NextResponse.json({
      ok: true,
      data: {
        taskId: task.taskId,
        userMessageId: task.userMessageId,
        assistantMessageId: task.assistantMessageId,
        status: 'queued',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'chat_task_create_failed',
        error: error instanceof Error ? error.message : 'Failed to create chat task',
      },
      { status: 500 }
    );
  }
}

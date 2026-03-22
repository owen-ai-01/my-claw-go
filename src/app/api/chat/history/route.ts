import { auth } from '@/lib/auth';
import { getLatestChatTask, listUserChatMessages } from '@/lib/myclawgo/user-chat';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get('agentId') || 'main';

  try {
    const [messages, latestTask] = await Promise.all([
      listUserChatMessages(userId, agentId),
      getLatestChatTask(userId, agentId),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          status: message.status,
          taskId: message.taskId,
        })),
        task: latestTask
          ? {
              id: latestTask.id,
              status: latestTask.status,
              error: latestTask.error,
              startedAt: latestTask.startedAt,
              finishedAt: latestTask.finishedAt,
            }
          : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'chat_history_failed',
        error: error instanceof Error ? error.message : 'Chat history failed',
      },
      { status: 500 }
    );
  }
}

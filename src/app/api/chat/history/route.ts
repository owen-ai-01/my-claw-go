import { auth } from '@/lib/auth';
import { requireUserBridgeTarget } from '@/lib/myclawgo/bridge-fetch';
import { getLatestChatTask, listUserChatMessages } from '@/lib/myclawgo/user-chat';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

type BridgeHistoryMessage = {
  id?: string;
  role?: 'user' | 'assistant';
  content?: string;
  text?: string;
  createdAt?: string;
  routedAgentId?: string;
  metadata?: {
    routedAgentId?: string;
  };
};

function normalizeMentionsToMembers(text: string, members: string[], currentSpeakerId?: string) {
  const safe = String(text || '');
  if (!safe || !Array.isArray(members) || members.length === 0) return safe;

  const memberSet = new Set(members);
  const pool = members.filter((m) => m !== currentSpeakerId);
  let idx = 0;
  const fallback = () => (pool[idx++ % Math.max(pool.length, 1)] || members[0]);

  return safe.replace(/@([a-zA-Z0-9_-]+)/g, (_full, id) => {
    const token = String(id || '');
    if (memberSet.has(token)) return `@${token}`;
    return `@${fallback()}`;
  });
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const groupId = url.searchParams.get('groupId');
  const agentId = url.searchParams.get('agentId') || 'main';

  try {
    if (groupId) {
      const bridge = await requireUserBridgeTarget();
      if (!bridge.ok) return bridge.response;

      const upstream = await fetch(
        `${bridge.target.bridge.baseUrl}/chat/history?groupId=${encodeURIComponent(groupId)}&limit=200`,
        {
          headers: { authorization: `Bearer ${bridge.target.bridge.token}` },
          cache: 'no-store',
        }
      );
      const payload = (await upstream.json().catch(() => ({ ok: false, error: 'Invalid bridge response' }))) as {
        ok?: boolean;
        data?: { messages?: BridgeHistoryMessage[] };
        error?: string | { message?: string };
      };

      if (!upstream.ok || payload.ok !== true) {
        return NextResponse.json(
          {
            ok: false,
            code: 'group_history_failed',
            error: typeof payload.error === 'string' ? payload.error : payload.error?.message || 'Group history failed',
          },
          { status: upstream.ok ? 502 : upstream.status }
        );
      }

      // Edge safety: normalize history @mentions to valid members for rendering consistency.
      let members: string[] = [];
      try {
        const groupRes = await fetch(`${bridge.target.bridge.baseUrl}/groups/${encodeURIComponent(groupId)}`, {
          headers: { authorization: `Bearer ${bridge.target.bridge.token}` },
          cache: 'no-store',
        });
        const groupPayload = (await groupRes.json().catch(() => ({}))) as { ok?: boolean; data?: { members?: string[] } };
        members = Array.isArray(groupPayload?.data?.members) ? groupPayload.data!.members! : [];
      } catch {
        members = [];
      }

      return NextResponse.json({
        ok: true,
        data: {
          messages: (payload.data?.messages || []).map((message) => {
            const routedAgentId = message.routedAgentId || message.metadata?.routedAgentId || undefined;
            const rawContent = message.content || message.text || '';
            const content = members.length > 0 && (message.role || 'assistant') === 'assistant'
              ? normalizeMentionsToMembers(rawContent, members, routedAgentId)
              : rawContent;
            return {
              id: message.id,
              role: message.role || 'assistant',
              content,
              createdAt: message.createdAt,
              status: 'done',
              routedAgentId,
            };
          }),
          task: null,
        },
      });
    }

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

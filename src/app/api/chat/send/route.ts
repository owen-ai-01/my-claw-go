import { auth } from '@/lib/auth';
import { checkUserCredits } from '@/lib/myclawgo/membership';
import { createDirectChatTask, settleDirectChatBilling, type DirectChatUsage } from '@/lib/myclawgo/user-chat';
import { requireUserBridgeTarget } from '@/lib/myclawgo/bridge-fetch';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const MIN_CREDITS_PER_MESSAGE = 1;

type GroupChatResponse = {
  ok?: boolean;
  data?: {
    reply?: string;
    model?: string;
    routedAgentId?: string;
    usage?: DirectChatUsage;
    raw?: unknown;
  };
  error?: string | { message?: string };
};

function normalizeMentionsToMembers(text: string, members: string[], currentSpeakerId?: string) {
  const safe = String(text || '').trim();
  if (!safe || !Array.isArray(members) || members.length === 0) return safe;

  const memberSet = new Set(members);
  const pool = members.filter((m) => m !== currentSpeakerId);
  const fallback = pool[0] || members[0];

  const mentions = [...safe.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => String(m[1] || ''));
  let chosen = mentions.find((m) => memberSet.has(m) && m !== currentSpeakerId) || null;
  if (!chosen && mentions.length > 0) chosen = fallback;
  if (!chosen) return safe;

  let used = false;
  return safe.replace(/@([a-zA-Z0-9_-]+)/g, () => {
    if (!used) {
      used = true;
      return `@${chosen}`;
    }
    return '';
  });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    agentId?: string;
    groupId?: string;
    timeoutMs?: number;
    model?: string; // 'auto' | specific model id
  };

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const agentId = String(body.agentId || 'main');
  const groupId = String(body.groupId || '').trim();

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
    if (groupId) {
      const bridge = await requireUserBridgeTarget();
      if (!bridge.ok) return bridge.response;

      const upstreamRes = await fetch(`${bridge.target.bridge.baseUrl}/chat/send`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bridge.target.bridge.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message,
          groupId,
          agentId,
          timeoutMs: body.timeoutMs || 90000,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(body.timeoutMs || 90000),
      });

      const payload = (await upstreamRes.json().catch(() => ({ ok: false, error: 'Invalid bridge response' }))) as GroupChatResponse;

      if (!upstreamRes.ok || payload.ok !== true || !payload.data?.reply?.trim()) {
        return NextResponse.json(
          {
            ok: false,
            code: 'group_chat_failed',
            error: typeof payload.error === 'string' ? payload.error : payload.error?.message || 'Group chat failed',
          },
          { status: upstreamRes.ok ? 502 : upstreamRes.status }
        );
      }

      // Safety net: enforce member-only @mentions at platform edge, too.
      let normalizedReply = payload.data.reply;
      try {
        const groupRes = await fetch(`${bridge.target.bridge.baseUrl}/groups/${encodeURIComponent(groupId)}`, {
          headers: { authorization: `Bearer ${bridge.target.bridge.token}` },
          cache: 'no-store',
        });
        const groupPayload = (await groupRes.json().catch(() => ({}))) as { ok?: boolean; data?: { members?: string[] } };
        const members = Array.isArray(groupPayload?.data?.members) ? groupPayload.data!.members! : [];
        if (members.length > 0) {
          normalizedReply = normalizeMentionsToMembers(payload.data.reply || '', members, payload.data.routedAgentId || agentId);
        }
      } catch {
        // ignore mention normalization fallback errors
      }

      await settleDirectChatBilling({
        taskId: `group:${groupId}:${Date.now()}`,
        userId,
        agentId: payload.data.routedAgentId || agentId,
        message,
        reply: normalizedReply,
        model: payload.data.model,
        usage: payload.data.usage,
        bridgeRaw: {
          kind: 'group_chat',
          groupId,
          routedAgentId: payload.data.routedAgentId || null,
          raw: payload.data.raw ?? null,
        },
      });

      return NextResponse.json({
        ok: true,
        data: {
          status: 'done',
          reply: normalizedReply,
          model: payload.data.model,
          routedAgentId: payload.data.routedAgentId || agentId,
        },
      });
    }

    const task = await createDirectChatTask({
      userId,
      agentId,
      message,
      timeoutMs: body.timeoutMs || 180000,
      // If user didn't explicitly pick a model, keep undefined.
      // This prevents implicit auto routing when auto feature is disabled.
      userModelOverride: body.model,
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

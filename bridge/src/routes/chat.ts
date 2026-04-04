import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import { ensureAgentExists, getAgent } from '../services/agent.js';
import { readChatTranscript } from '../services/chat-store.js';
import { sendChatMessage } from '../services/openclaw.js';
import { getBridgeState } from '../services/state.js';
import { getGroup } from '../services/group.js';

function extractMentionedAgentId(message: string, members: string[]) {
  const mentionMatches = [...message.matchAll(/@([a-zA-Z0-9_-]+)/g)];
  for (const match of mentionMatches) {
    const candidate = match[1];
    if (members.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Build a group context prefix to inject into messages sent to agents.
 * This lets the receiving agent know it's in a group and who is in it.
 */
async function buildGroupContext(params: {
  groupId: string;
  groupName: string;
  members: string[];
  leaderId: string;
  targetAgentId: string;
  mentionedAgentId: string | null;
}): Promise<string> {
  const { groupId, groupName, members, leaderId, targetAgentId, mentionedAgentId } = params;

  // Resolve member names
  const memberDescs: string[] = [];
  for (const memberId of members) {
    try {
      const agent = await getAgent(memberId);
      const displayName = agent.name?.trim() || memberId;
      memberDescs.push(`@${memberId}${displayName !== memberId ? ` (${displayName})` : ''}${memberId === leaderId ? ' [leader]' : ''}`);
    } catch {
      memberDescs.push(`@${memberId}${memberId === leaderId ? ' [leader]' : ''}`);
    }
  }

  const targetNote = mentionedAgentId && mentionedAgentId !== targetAgentId
    ? `(responding on behalf of @${mentionedAgentId})`
    : '';

  return [
    `[Group Chat: ${groupName} | id: ${groupId}]`,
    `[Members: ${memberDescs.join(', ')}]`,
    `[You are: @${targetAgentId}${targetNote ? ' ' + targetNote : ''}]`,
    `[Guidelines: Reply as yourself. If another member is @mentioned, address them appropriately. Stay in character.]`,
    '',
  ].join('\n');
}

export async function chatRoutes(app: FastifyInstance) {
  app.get('/chat/history', async (req: any, reply) => {
    try {
      const state = await getBridgeState();
      const groupId = req.query?.groupId ? String(req.query.groupId) : null;
      
      if (groupId) {
        // 群组聊天历史
        const group = await getGroup(groupId);
        const messages = await readChatTranscript({ agentId: group.leaderId, channel: 'group', chatScope: groupId });
        return ok(reply, { groupId, messages });
      } else {
        // Agent 聊天历史
        const agentId = String(req.query?.agentId || state.defaultAgentId || 'main');
        const channel = String(req.query?.channel || 'direct');
        const chatScope = String(req.query?.chatScope || 'default');
        await ensureAgentExists(agentId);
        const messages = await readChatTranscript({ agentId, channel, chatScope });
        return ok(reply, { agentId, messages });
      }
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'history failed', error.statusCode || 500);
    }
  });

  app.post('/chat/send', async (req: any, reply) => {
    const routeStartedAt = Date.now();
    try {
      const body = req.body || {};
      const message = String(body.message || '').trim();
      if (!message) {
        return fail(reply, 'INVALID_PARAMS', 'message is required', 400);
      }

      const groupId = body.groupId ? String(body.groupId) : null;
      let targetAgentId: string;
      let channel: string;
      let chatScope: string;

      if (groupId) {
        // ── Group chat routing ────────────────────────────────────────────────
        const group = await getGroup(groupId);
        const mentionedAgentId = extractMentionedAgentId(message, group.members);

        // Determine who should reply:
        //   1. Explicitly @mentioned member → that agent
        //   2. No @mention → group leader
        const preferredTarget = mentionedAgentId || group.leaderId;

        // Verify the preferred target has a real OpenClaw session (workspace).
        // If not, fall back to the leader — they always have a session.
        let resolvedTarget = group.leaderId; // default: always valid
        if (preferredTarget !== group.leaderId) {
          try {
            await ensureAgentExists(preferredTarget);
            // Try to use the preferred agent (they may have a workspace)
            resolvedTarget = preferredTarget;
          } catch {
            // Preferred agent not available → fall back to leader
            app.log.warn(`[group] agent ${preferredTarget} not found, falling back to leader ${group.leaderId}`);
            resolvedTarget = group.leaderId;
          }
        }

        targetAgentId = resolvedTarget;
        channel = 'group';
        chatScope = groupId;

        await ensureAgentExists(targetAgentId);

        // Inject group context prefix so the agent knows the group, members, and its role
        const groupCtxPrefix = await buildGroupContext({
          groupId,
          groupName: group.name || groupId,
          members: group.members,
          leaderId: group.leaderId,
          targetAgentId,
          mentionedAgentId,
        });
        // Prepend context to the actual user message
        (req.body as any).__groupMessage = message;
        (req.body as any).__groupContextMessage = `${groupCtxPrefix}User message: ${message}`;
        (req.body as any).__routedTo = targetAgentId;
        (req.body as any).__mentionedAgentId = mentionedAgentId;
      } else {
        // Agent 消息
        const state = await getBridgeState();
        targetAgentId = String(body.agentId || state.defaultAgentId || 'main');
        channel = String(body.channel || 'direct');
        chatScope = String(body.chatScope || 'default');
        await ensureAgentExists(targetAgentId);
      }

      const agentStartedAt = Date.now();
      // model: passed from platform's model router (optional)
      const modelOverride = body.model ? String(body.model).trim() : undefined;

      // For group chat, use context-enriched message; for direct chat, use original
      const messageToSend: string = (body as any).__groupContextMessage || message;
      // The raw user message (for transcript storage, without context prefix)
      const rawUserMessage: string = (body as any).__groupMessage || message;

      const result = await sendChatMessage({
        message: messageToSend,
        rawMessage: rawUserMessage,
        agentId: targetAgentId,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : 90000,
        channel,
        chatScope,
        model: modelOverride,
      });
      const agentDurationMs = Date.now() - agentStartedAt;
      const routeDurationMs = Date.now() - routeStartedAt;

      app.log.info(
        `[bridge/chat/send timing] targetAgent=${targetAgentId}` +
        `${groupId ? ` group=${groupId}` : ''}` +
        ` bridgeRouteMs=${routeDurationMs}` +
        ` openclawAgentMs=${agentDurationMs}` +
        `${result.timing ? ` connectMs=${result.timing.connectMs} chatSendMs=${result.timing.chatSendMs} agentWaitMs=${result.timing.agentWaitMs} chatHistoryMs=${result.timing.chatHistoryMs} totalGatewayMs=${result.timing.totalGatewayMs}` : ''}`
      );

      return ok(reply, {
        agentId: targetAgentId,
        routedAgentId: targetAgentId,
        mentionedAgentId: (body as any).__mentionedAgentId || null,
        groupId: groupId || undefined,
        reply: result.reply,
        model: result.model,
        usage: result.usage,
        raw: result.raw,
        timing: {
          bridgeRouteMs: routeDurationMs,
          openclawAgentMs: agentDurationMs,
          ...(result.timing || {}),
        },
      });
    } catch (error: any) {
      return fail(
        reply,
        error.code || 'INTERNAL_ERROR',
        error.message || 'chat failed',
        error.statusCode || 500,
        error.details
      );
    }
  });
}

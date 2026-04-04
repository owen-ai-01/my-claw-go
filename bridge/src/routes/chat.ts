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

/** Build group context to keep all agents aware of leader/members/rules. */
async function buildGroupContext(params: {
  groupId: string;
  groupName: string;
  members: string[];
  leaderId: string;
  targetAgentId: string;
  mode: 'human-entry' | 'relay-handoff';
  mentionedAgentId?: string | null;
  fromAgentId?: string | null;
  originalUserMessage?: string;
  previousReply?: string;
  turnIndex?: number;
  maxTurns?: number;
}): Promise<string> {
  const {
    groupId,
    groupName,
    members,
    leaderId,
    targetAgentId,
    mode,
    mentionedAgentId,
    fromAgentId,
    originalUserMessage,
    previousReply,
    turnIndex,
    maxTurns,
  } = params;

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

  const lines = [
    `[Group Chat: ${groupName} | id: ${groupId}]`,
    `[Members: ${memberDescs.join(', ')}]`,
    `[Leader (primary owner): @${leaderId}]`,
    `[You are: @${targetAgentId}]`,
  ];

  if (mode === 'human-entry') {
    lines.push(`[Mode: human-entry. The human spoke to the group. Leader should coordinate and may @mention next member.]`);
    if (mentionedAgentId) lines.push(`[Human mentioned: @${mentionedAgentId}]`);
    if (originalUserMessage) lines.push(`[Human message]: ${originalUserMessage}`);
  } else {
    lines.push(`[Mode: relay-handoff. You were @mentioned by @${fromAgentId || 'leader'} and should continue quickly.]`);
    if (typeof turnIndex === 'number' && typeof maxTurns === 'number') {
      lines.push(`[Relay turn: ${turnIndex}/${maxTurns}]`);
    }
    if (originalUserMessage) lines.push(`[Original human request]: ${originalUserMessage}`);
    if (previousReply) lines.push(`[Previous message from @${fromAgentId || 'unknown'}]: ${previousReply}`);
  }

  lines.push(
    '[Reply rules: 1) Stay in role. 2) Keep momentum. 3) If handoff is needed, @mention exactly one next member from this group. 4) Do not say system errors/apologies unless truly failed.]',
    ''
  );

  return lines.join('\n');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickFirstMentionInText(text: string, members: string[]) {
  return extractMentionedAgentId(text || '', members);
}

async function runGroupAutoRelay(params: {
  app: FastifyInstance;
  group: any;
  initialReply: string;
  initialSpeakerId: string;
  originalUserMessage: string;
  timeoutMs: number;
  modelOverride?: string;
}) {
  const { app, group, initialReply, initialSpeakerId, originalUserMessage, timeoutMs, modelOverride } = params;
  const relayEnabled = group?.relay?.enabled !== false;
  if (!relayEnabled) return;

  const maxTurns = Math.min(Math.max(Number(group?.relay?.maxTurns || 6), 1), 20);
  const cooldownMs = Math.min(Math.max(Number(group?.relay?.cooldownMs || 900), 0), 10000);

  let currentSpeaker = initialSpeakerId;
  let previousReply = initialReply;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const nextMention = pickFirstMentionInText(previousReply, group.members || []);
    if (!nextMention) break;

    let nextAgentId = nextMention;
    try {
      await ensureAgentExists(nextAgentId);
    } catch {
      app.log.warn(`[group/relay] mentioned agent ${nextAgentId} unavailable, fallback to leader ${group.leaderId}`);
      nextAgentId = group.leaderId;
    }

    await sleep(cooldownMs);

    const relayCtx = await buildGroupContext({
      groupId: group.id,
      groupName: group.name || group.id,
      members: group.members,
      leaderId: group.leaderId,
      targetAgentId: nextAgentId,
      mode: 'relay-handoff',
      fromAgentId: currentSpeaker,
      originalUserMessage,
      previousReply,
      turnIndex: turn,
      maxTurns,
    });

    const relayPrompt = `${relayCtx}Continue the conversation now, in one concise turn.`;

    const relayResult = await sendChatMessage({
      message: relayPrompt,
      rawMessage: ' ', // keep relay internal prompts hidden from rendered history
      agentId: nextAgentId,
      transcriptAgentId: group.leaderId,
      timeoutMs: Math.min(Math.max(timeoutMs, 15000), 45000),
      channel: 'group',
      chatScope: group.id,
      model: modelOverride,
    });

    previousReply = relayResult.reply || '';
    currentSpeaker = nextAgentId;
  }
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
        // ── Group chat policy: single primary owner (leader) is entrypoint ───
        const group = await getGroup(groupId);
        const mentionedAgentId = extractMentionedAgentId(message, group.members);

        targetAgentId = group.leaderId;
        channel = 'group';
        chatScope = groupId;
        await ensureAgentExists(targetAgentId);

        const groupCtxPrefix = await buildGroupContext({
          groupId,
          groupName: group.name || groupId,
          members: group.members,
          leaderId: group.leaderId,
          targetAgentId,
          mode: 'human-entry',
          mentionedAgentId,
          originalUserMessage: message,
        });

        (req.body as any).__group = group;
        (req.body as any).__groupMessage = message;
        (req.body as any).__groupContextMessage = `${groupCtxPrefix}Now respond as @${targetAgentId}.`;
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

      const timeoutMs = body.timeoutMs ? Number(body.timeoutMs) : 90000;
      const result = await sendChatMessage({
        message: messageToSend,
        rawMessage: rawUserMessage,
        agentId: targetAgentId,
        transcriptAgentId: groupId ? (body as any).__group?.leaderId || targetAgentId : undefined,
        timeoutMs,
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

      // Fire-and-forget group auto relay chain (leader may @ next member)
      if (groupId && (body as any).__group && result.reply?.trim()) {
        runGroupAutoRelay({
          app,
          group: (body as any).__group,
          initialReply: result.reply,
          initialSpeakerId: targetAgentId,
          originalUserMessage: rawUserMessage,
          timeoutMs,
          modelOverride,
        }).catch((err) => {
          app.log.error(`[group/relay] chain failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

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

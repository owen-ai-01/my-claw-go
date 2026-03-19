import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import { ensureAgentExists } from '../services/agent.js';
import { readChatTranscript } from '../services/chat-store.js';
import { sendChatMessage } from '../services/openclaw.js';
import { getBridgeState } from '../services/state.js';
import { getGroup } from '../services/group.js';

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
        // 群组消息：发给群主
        const group = await getGroup(groupId);
        targetAgentId = group.leaderId;
        channel = 'group';
        chatScope = groupId;
        await ensureAgentExists(targetAgentId);
      } else {
        // Agent 消息
        const state = await getBridgeState();
        targetAgentId = String(body.agentId || state.defaultAgentId || 'main');
        channel = String(body.channel || 'direct');
        chatScope = String(body.chatScope || 'default');
        await ensureAgentExists(targetAgentId);
      }

      const result = await sendChatMessage({
        message,
        agentId: targetAgentId,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : 90000,
        channel,
        chatScope,
      });

      return ok(reply, {
        agentId: targetAgentId,
        groupId: groupId || undefined,
        reply: result.reply,
        model: result.model,
        usage: result.usage,
        raw: result.raw,
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

import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import { ensureAgentExists } from '../services/agent.js';
import { readChatTranscript } from '../services/chat-store.js';
import { sendChatMessage } from '../services/openclaw.js';
import { getBridgeState } from '../services/state.js';

export async function chatRoutes(app: FastifyInstance) {
  app.get('/chat/history', async (req: any, reply) => {
    try {
      const state = await getBridgeState();
      const agentId = String(req.query?.agentId || state.defaultAgentId || 'main');
      const channel = String(req.query?.channel || 'direct');
      const chatScope = String(req.query?.chatScope || 'default');
      await ensureAgentExists(agentId);
      const messages = await readChatTranscript({ agentId, channel, chatScope });
      return ok(reply, { agentId, messages });
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

      const state = await getBridgeState();
      const agentId = String(body.agentId || state.defaultAgentId || 'main');
      await ensureAgentExists(agentId);

      const result = await sendChatMessage({
        message,
        agentId,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : 90000,
        channel: String(body.channel || 'direct'),
        chatScope: String(body.chatScope || 'default'),
      });

      return ok(reply, {
        agentId,
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

import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import { ensureAgentExists, listAgents } from '../services/agent.js';
import { setDefaultAgentId } from '../services/state.js';

export async function agentRoutes(app: FastifyInstance) {
  app.get('/agents', async (_req, reply) => {
    const data = await listAgents();
    return ok(reply, data);
  });

  app.post('/agent/select', async (req: any, reply) => {
    try {
      const agentId = String(req.body?.agentId || '').trim();
      if (!agentId) {
        return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      }
      await ensureAgentExists(agentId);
      const state = await setDefaultAgentId(agentId);
      return ok(reply, { selectedAgentId: state.defaultAgentId });
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'select failed', error.statusCode || 500);
    }
  });
}

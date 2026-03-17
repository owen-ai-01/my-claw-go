import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import {
  ensureAgentExists,
  getAgent,
  getAgentMarkdown,
  listAgents,
  updateAgent,
  updateAgentMarkdown,
} from '../services/agent.js';
import { setDefaultAgentId } from '../services/state.js';

export async function agentRoutes(app: FastifyInstance) {
  app.get('/agents', async (_req, reply) => {
    try {
      const data = await listAgents();
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'list agents failed', error.statusCode || 500);
    }
  });

  app.get('/agents/:agentId', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await getAgent(agentId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'get agent failed', error.statusCode || 500);
    }
  });

  app.get('/agents/:agentId/agents-md', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await getAgentMarkdown(agentId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'get AGENTS.md failed', error.statusCode || 500);
    }
  });

  app.put('/agents/:agentId/agents-md', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await updateAgentMarkdown(agentId, content);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update AGENTS.md failed', error.statusCode || 500);
    }
  });

  app.patch('/agents/:agentId', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const patch = {
        model: typeof req.body?.model === 'string' ? req.body.model : undefined,
      };
      const data = await updateAgent(agentId, patch);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update agent failed', error.statusCode || 500);
    }
  });

  app.post('/agent/select', async (req: any, reply) => {
    try {
      const agentId = String(req.body?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      await ensureAgentExists(agentId);
      const state = await setDefaultAgentId(agentId);
      return ok(reply, { selectedAgentId: state.defaultAgentId });
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'select failed', error.statusCode || 500);
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import {
  ensureAgentExists,
  getAgent,
  getAgentMarkdown,
  listAgents,
  updateAgent,
  updateAgentMarkdown,
  updateAgentTelegram,
  createAgent,
  deleteAgent,
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

  app.post('/agents', async (req: any, reply) => {
    try {
      const { agentId, name, workspace, model, role, description, department, enabled, avatar, emoji } = req.body || {};
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await createAgent({ agentId, name, workspace, model, role, description, department, enabled, avatar, emoji });
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'create agent failed', error.statusCode || 500);
    }
  });

  app.delete('/agents/:agentId', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await deleteAgent(agentId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'delete agent failed', error.statusCode || 500);
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

  app.get('/agents/:agentId/status', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      
      // 简化版状态：返回基本 agent 信息 + 一些扩展状态
      const agent = await getAgent(agentId);
      const status = {
        agentId,
        online: agent.enabled !== false, // 简化版：disabled agent 视为不在线
        lastActivity: new Date().toISOString(),
        currentTask: null,
        recentErrors: [],
      };
      
      return ok(reply, { agent, status });
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'get status failed', error.statusCode || 500);
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
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        role: typeof req.body?.role === 'string' ? req.body.role : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        department: typeof req.body?.department === 'string' ? req.body.department : undefined,
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
        avatar: typeof req.body?.avatar === 'string' ? req.body.avatar : undefined,
      };
      const data = await updateAgent(agentId, patch);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update agent failed', error.statusCode || 500);
    }
  });

  app.put('/agents/:agentId/channels/telegram', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const patch = {
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
        botToken: typeof req.body?.botToken === 'string' ? req.body.botToken : undefined,
        bindingEnabled: typeof req.body?.bindingEnabled === 'boolean' ? req.body.bindingEnabled : undefined,
      };
      const data = await updateAgentTelegram(agentId, patch);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update telegram failed', error.statusCode || 500);
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

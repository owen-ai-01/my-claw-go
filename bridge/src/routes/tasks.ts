import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import {
  createAgentTask,
  deleteAgentTask,
  listAgentTaskRuns,
  listAgentTasks,
  runAgentTask,
  updateAgentTask,
} from '../services/task.js';

export async function taskRoutes(app: FastifyInstance) {
  app.get('/agents/:agentId/tasks', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await listAgentTasks(agentId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'list tasks failed', error.statusCode || 500);
    }
  });

  app.post('/agents/:agentId/tasks', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      if (!agentId) return fail(reply, 'INVALID_PARAMS', 'agentId is required', 400);
      const data = await createAgentTask(agentId, req.body || {});
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'create task failed', error.statusCode || 500);
    }
  });

  app.patch('/agents/:agentId/tasks/:taskId', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      const taskId = String(req.params?.taskId || '').trim();
      if (!agentId || !taskId) return fail(reply, 'INVALID_PARAMS', 'agentId and taskId are required', 400);
      const data = await updateAgentTask(agentId, taskId, req.body || {});
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update task failed', error.statusCode || 500);
    }
  });

  app.delete('/agents/:agentId/tasks/:taskId', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      const taskId = String(req.params?.taskId || '').trim();
      if (!agentId || !taskId) return fail(reply, 'INVALID_PARAMS', 'agentId and taskId are required', 400);
      const data = await deleteAgentTask(agentId, taskId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'delete task failed', error.statusCode || 500);
    }
  });

  app.post('/agents/:agentId/tasks/:taskId/run', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      const taskId = String(req.params?.taskId || '').trim();
      if (!agentId || !taskId) return fail(reply, 'INVALID_PARAMS', 'agentId and taskId are required', 400);
      const data = await runAgentTask(agentId, taskId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'run task failed', error.statusCode || 500);
    }
  });

  app.get('/agents/:agentId/tasks/:taskId/runs', async (req: any, reply) => {
    try {
      const agentId = String(req.params?.agentId || '').trim();
      const taskId = String(req.params?.taskId || '').trim();
      const limit = Number(req.query?.limit || 20);
      if (!agentId || !taskId) return fail(reply, 'INVALID_PARAMS', 'agentId and taskId are required', 400);
      const data = await listAgentTaskRuns(agentId, taskId, Number.isFinite(limit) ? limit : 20);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'list task runs failed', error.statusCode || 500);
    }
  });
}

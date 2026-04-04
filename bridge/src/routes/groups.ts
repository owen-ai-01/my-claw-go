import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import {
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  updateGroup,
} from '../services/group.js';

export async function groupRoutes(app: FastifyInstance) {
  app.get('/groups', async (_req, reply) => {
    try {
      const data = await listGroups();
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'list groups failed', error.statusCode || 500);
    }
  });

  app.post('/groups', async (req: any, reply) => {
    try {
      const { id, name, description, announcement, leaderId, members, relay } = req.body || {};
      if (!id) return fail(reply, 'INVALID_PARAMS', 'id is required', 400);
      if (!name) return fail(reply, 'INVALID_PARAMS', 'name is required', 400);
      if (!leaderId) return fail(reply, 'INVALID_PARAMS', 'leaderId is required', 400);
      if (!members) return fail(reply, 'INVALID_PARAMS', 'members is required', 400);

      const data = await createGroup({ id, name, description, announcement, leaderId, members, relay });
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'create group failed', error.statusCode || 500);
    }
  });

  app.get('/groups/:groupId', async (req: any, reply) => {
    try {
      const groupId = String(req.params?.groupId || '').trim();
      if (!groupId) return fail(reply, 'INVALID_PARAMS', 'groupId is required', 400);
      const data = await getGroup(groupId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'get group failed', error.statusCode || 500);
    }
  });

  app.patch('/groups/:groupId', async (req: any, reply) => {
    try {
      const groupId = String(req.params?.groupId || '').trim();
      if (!groupId) return fail(reply, 'INVALID_PARAMS', 'groupId is required', 400);

      const patch = {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        announcement: typeof req.body?.announcement === 'string' ? req.body.announcement : undefined,
        leaderId: typeof req.body?.leaderId === 'string' ? req.body.leaderId : undefined,
        members: Array.isArray(req.body?.members) ? req.body.members : undefined,
        relay: req.body?.relay && typeof req.body.relay === 'object' ? {
          enabled: typeof req.body.relay.enabled === 'boolean' ? req.body.relay.enabled : undefined,
          maxTurns: Number.isFinite(Number(req.body.relay.maxTurns)) ? Number(req.body.relay.maxTurns) : undefined,
          cooldownMs: Number.isFinite(Number(req.body.relay.cooldownMs)) ? Number(req.body.relay.cooldownMs) : undefined,
        } : undefined,
      };

      const data = await updateGroup(groupId, patch);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'update group failed', error.statusCode || 500);
    }
  });

  app.delete('/groups/:groupId', async (req: any, reply) => {
    try {
      const groupId = String(req.params?.groupId || '').trim();
      if (!groupId) return fail(reply, 'INVALID_PARAMS', 'groupId is required', 400);
      const data = await deleteGroup(groupId);
      return ok(reply, data);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'delete group failed', error.statusCode || 500);
    }
  });
}

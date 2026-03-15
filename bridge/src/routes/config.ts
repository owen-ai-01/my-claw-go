import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import { getConfig, setConfig } from '../services/config.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/config/get', async (req: any, reply) => {
    try {
      const path = String(req.query?.path || 'all');
      const value = await getConfig(path);
      return ok(reply, { path, value });
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'config get failed', error.statusCode || 500);
    }
  });

  app.post('/config/set', async (req: any, reply) => {
    try {
      const path = String(req.body?.path || '').trim();
      const value = req.body?.value;
      if (!path) {
        return fail(reply, 'INVALID_PARAMS', 'path is required', 400);
      }
      const result = await setConfig(path, value);
      return ok(reply, result);
    } catch (error: any) {
      return fail(reply, error.code || 'INTERNAL_ERROR', error.message || 'config set failed', error.statusCode || 500);
    }
  });
}

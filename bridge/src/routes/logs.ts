import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/response.js';
import { getRecentLogs } from '../services/logs.js';

export async function logRoutes(app: FastifyInstance) {
  app.get('/logs/recent', async (req: any, reply) => {
    const source = (req.query?.source || 'bridge') as 'bridge' | 'gateway';
    const lines = Number(req.query?.lines || 100);
    const data = await getRecentLogs(source, lines);
    return ok(reply, { source, lines: data });
  });
}

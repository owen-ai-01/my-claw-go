import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/response.js';
import { listRecentActivity } from '../services/activity.js';

export async function activityRoutes(app: FastifyInstance) {
  app.get('/activity/recent', async (req: any, reply) => {
    const limit = Number(req.query?.limit || 120);
    const events = await listRecentActivity(limit);
    return ok(reply, { events });
  });
}

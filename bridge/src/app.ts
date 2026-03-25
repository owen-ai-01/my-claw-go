import Fastify from 'fastify';
import { agentRoutes } from './routes/agents.js';
import { chatRoutes } from './routes/chat.js';
import { configRoutes } from './routes/config.js';
import { healthRoutes } from './routes/health.js';
import { logRoutes } from './routes/logs.js';
import { groupRoutes } from './routes/groups.js';
import { taskRoutes } from './routes/tasks.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', async (req, reply) => {
    const expected = process.env.BRIDGE_TOKEN;
    if (!expected) return;
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== expected) {
      return reply.status(401).send({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid bridge token' },
      });
    }
  });

  await healthRoutes(app);
  await chatRoutes(app);
  await agentRoutes(app);
  await groupRoutes(app);
  await taskRoutes(app);
  await configRoutes(app);
  await logRoutes(app);

  return app;
}

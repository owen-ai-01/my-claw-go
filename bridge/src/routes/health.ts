import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/response.js';
import {
  checkOpenClawHealth,
  checkOpenClawReady,
} from '../services/openclaw.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    try {
      await checkOpenClawHealth();
      return ok(reply, {
        bridge: { service: 'openclaw-bridge', version: '0.1.0' },
        openclaw: { installed: true, gatewayReachable: true },
      });
    } catch {
      return fail(reply, 'OPENCLAW_NOT_READY', 'OpenClaw is not ready', 503);
    }
  });

  app.get('/ready', async (_req, reply) => {
    try {
      await checkOpenClawReady();
      return ok(reply, {
        bridge: { service: 'openclaw-bridge', version: '0.1.0' },
        openclaw: {
          installed: true,
          gatewayReachable: true,
          gatewaySessionReady: true,
        },
      });
    } catch {
      return fail(
        reply,
        'OPENCLAW_NOT_READY',
        'OpenClaw gateway session is not ready',
        503
      );
    }
  });
}

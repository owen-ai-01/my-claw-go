import { runProvisionWorker } from '@/lib/myclawgo/provision-worker';

if (process.env.ENABLE_PROVISION_WORKER === 'true') {
  const intervalMs = Number(process.env.PROVISION_WORKER_INTERVAL_MS ?? 30_000);

  console.log(`[provision] Worker started, interval: ${intervalMs}ms`);
  setInterval(() => {
    runProvisionWorker().catch((e) =>
      console.error('[provision] Worker uncaught error:', e)
    );
  }, intervalMs);
}

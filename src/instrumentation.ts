export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.ENABLE_PROVISION_WORKER !== 'true') return;

  const { runProvisionWorker } = await import('@/lib/myclawgo/provision-worker');
  const intervalMs = Number(process.env.PROVISION_WORKER_INTERVAL_MS ?? 30_000);

  console.log(`[provision] Worker started, interval: ${intervalMs}ms`);
  setInterval(() => {
    runProvisionWorker().catch((e) => console.error('[provision] Worker uncaught error:', e));
  }, intervalMs);
}

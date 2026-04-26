async function syncHetznerProjectsFromEnv() {
  const raw = process.env.HETZNER_PROJECTS;
  if (!raw) return;

  let projects: Array<{
    id: string;
    name: string;
    apiToken: string;
    region?: string;
    maxServers?: number;
    sshKeyId?: number;
    firewallId?: number;
    snapshotId?: number | null;
  }>;
  try {
    projects = JSON.parse(raw);
  } catch {
    console.error('[provision] Failed to parse HETZNER_PROJECTS env var — check JSON syntax');
    return;
  }

  const { getDb } = await import('@/db');
  const { hetznerProject } = await import('@/db/schema');
  const db = await getDb();

  for (const p of projects) {
    await db
      .insert(hetznerProject)
      .values({
        id: p.id,
        name: p.name,
        apiToken: p.apiToken,
        region: p.region ?? 'fsn1',
        maxServers: p.maxServers ?? 90,
        sshKeyId: p.sshKeyId ?? 0,
        firewallId: p.firewallId ?? 0,
        snapshotId: p.snapshotId ?? null,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: hetznerProject.id,
        set: {
          name: p.name,
          apiToken: p.apiToken,
          region: p.region ?? 'fsn1',
          maxServers: p.maxServers ?? 90,
          sshKeyId: p.sshKeyId ?? 0,
          firewallId: p.firewallId ?? 0,
          snapshotId: p.snapshotId ?? null,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`[provision] Synced ${projects.length} Hetzner project(s) from HETZNER_PROJECTS env`);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.ENABLE_PROVISION_WORKER !== 'true') return;

  await syncHetznerProjectsFromEnv();

  const { runProvisionWorker } = await import('@/lib/myclawgo/provision-worker');
  const intervalMs = Number(process.env.PROVISION_WORKER_INTERVAL_MS ?? 30_000);

  console.log(`[provision] Worker started, interval: ${intervalMs}ms`);
  setInterval(() => {
    runProvisionWorker().catch((e) => console.error('[provision] Worker uncaught error:', e));
  }, intervalMs);
}

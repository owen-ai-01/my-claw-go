import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import {
  hetznerProject,
  runtimeAllocation,
  runtimeHost,
  runtimeProvisionJob,
} from '@/db/schema';
import { hetznerClient } from '@/lib/hetzner/client';
import { and, eq, lt, sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { buildCloudInit } from './cloud-init';

const SERVER_TYPE_MAP: Record<string, string> = {
  pro: 'cx23',
  premium: 'cx33',
  ultra: 'cx53',
};

async function selectAvailableProject(db: Awaited<ReturnType<typeof getDb>>) {
  const projects = await db
    .select()
    .from(hetznerProject)
    .where(eq(hetznerProject.status, 'active'));

  for (const p of projects) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(runtimeHost)
      .where(eq(runtimeHost.projectId, p.id));
    if ((row?.count ?? 0) < p.maxServers) return p;
  }
  return null;
}

async function signRegistrationToken(payload: {
  userId: string;
  jobId: string;
}) {
  const secret = process.env.RUNTIME_REGISTER_TOKEN_SECRET;
  if (!secret) throw new Error('RUNTIME_REGISTER_TOKEN_SECRET not set');
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(key);
}

async function provisionOneUser(job: {
  id: string;
  userId: string;
  plan: string;
}) {
  const db = await getDb();

  const project = await selectAvailableProject(db);
  if (!project) {
    throw new Error('All Hetzner projects full. Operator action required.');
  }

  const bridgeToken = randomUUID();
  const registrationToken = await signRegistrationToken({
    userId: job.userId,
    jobId: job.id,
  });
  const serverType = SERVER_TYPE_MAP[job.plan] ?? 'cx23';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set');
  const callbackUrl = `${appUrl}/api/internal/runtime/register`;

  await db
    .update(runtimeProvisionJob)
    .set({ status: 'buying_vps', updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, job.id));

  const client = hetznerClient(project.apiToken);
  const server = await client.createServer({
    name: `myclawgo-user-${job.userId.slice(0, 8)}`,
    serverType,
    location: project.region,
    imageId: project.snapshotId ?? undefined,
    imageName: project.snapshotId ? undefined : 'ubuntu-24.04',
    firewallId: project.firewallId,
    sshKeyId: project.sshKeyId,
    userData: buildCloudInit({
      userId: job.userId,
      registrationCallbackUrl: callbackUrl,
      registrationToken,
    }),
    labels: { type: 'runtime-host', userId: job.userId, plan: job.plan },
  });

  const hostId = randomUUID();
  await db.insert(runtimeHost).values({
    id: hostId,
    userId: job.userId,
    projectId: project.id,
    hetznerServerId: String(server.id),
    name: server.name,
    plan: job.plan,
    serverType,
    region: project.region,
    bridgeToken,
    status: 'waiting_init',
  });

  await db
    .update(runtimeProvisionJob)
    .set({
      status: 'waiting_init',
      projectId: project.id,
      hetznerServerId: String(server.id),
      updatedAt: new Date(),
    })
    .where(eq(runtimeProvisionJob.id, job.id));
}

async function cleanupExpiredVps(db: Awaited<ReturnType<typeof getDb>>) {
  const retentionDays = Number(process.env.VPS_DATA_RETENTION_DAYS ?? 7);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await db
    .select()
    .from(runtimeHost)
    .where(
      and(eq(runtimeHost.status, 'stopped'), lt(runtimeHost.stoppedAt, cutoff))
    );

  for (const host of expired) {
    if (!host.hetznerServerId || !host.projectId) continue;
    try {
      const [project] = await db
        .select()
        .from(hetznerProject)
        .where(eq(hetznerProject.id, host.projectId))
        .limit(1);
      if (project) {
        await hetznerClient(project.apiToken).deleteServer(
          Number(host.hetznerServerId)
        );
      }
      await db
        .update(runtimeHost)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(runtimeHost.id, host.id));
      await db
        .update(runtimeAllocation)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(runtimeAllocation.userId, host.userId!));
      console.log(`[provision] Deleted expired VPS for user ${host.userId}`);
    } catch (err) {
      console.error(
        `[provision] Failed to delete expired VPS ${host.id}:`,
        err
      );
    }
  }
}

export async function runProvisionWorker() {
  try {
    const db = await getDb();

    const jobs = await db
      .select()
      .from(runtimeProvisionJob)
      .where(
        and(
          eq(runtimeProvisionJob.status, 'pending'),
          lt(runtimeProvisionJob.attemptCount, 3)
        )
      )
      .for('update', { skipLocked: true })
      .limit(3);

    for (const job of jobs) {
      const nextAttempt = (job.attemptCount ?? 0) + 1;
      await db
        .update(runtimeProvisionJob)
        .set({ attemptCount: nextAttempt, updatedAt: new Date() })
        .where(eq(runtimeProvisionJob.id, job.id));

      await provisionOneUser(job).catch(async (err) => {
        console.error(`[provision] Failed for user ${job.userId}:`, err);
        const db2 = await getDb();
        await db2
          .update(runtimeProvisionJob)
          .set({
            status: nextAttempt >= 3 ? 'failed' : 'pending',
            lastError: String(err.message ?? err),
            updatedAt: new Date(),
          })
          .where(eq(runtimeProvisionJob.id, job.id));
      });
    }

    await cleanupExpiredVps(db);
  } catch (err) {
    console.error('[provision] Worker error:', err);
  }
}

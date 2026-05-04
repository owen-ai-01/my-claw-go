import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import {
  payment,
  runtimeAllocation,
  runtimeHost,
  runtimeProvisionJob,
} from '@/db/schema';
import { hetznerClient } from '@/lib/hetzner/client';
import {
  type HetznerProjectConfig,
  getHetznerProjectById,
  getHetznerProjects,
} from '@/lib/hetzner/projects';
import { stopRuntimeForUser } from './runtime-provision';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { buildCloudInit } from './cloud-init';

const SERVER_TYPE_MAP: Record<string, string> = {
  pro: 'cx23',
  premium: 'cx33',
  ultra: 'cx53',
};

async function selectAvailableProject(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<HetznerProjectConfig | null> {
  const projects = getHetznerProjects();

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
  await db
    .update(runtimeAllocation)
    .set({ status: 'buying_vps', updatedAt: new Date() })
    .where(eq(runtimeAllocation.userId, job.userId));

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
  await db
    .update(runtimeAllocation)
    .set({ status: 'waiting_init', updatedAt: new Date() })
    .where(eq(runtimeAllocation.userId, job.userId));
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
      const project = getHetznerProjectById(host.projectId);
      if (!project) {
        throw new Error(
          `Hetzner project ${host.projectId} not found in HETZNER_PROJECTS`
        );
      }
      await hetznerClient(project.apiToken).deleteServer(
        Number(host.hetznerServerId)
      );
      await db
        .update(runtimeHost)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(runtimeHost.id, host.id));
      await db
        .update(runtimeAllocation)
        .set({ status: 'stopped', updatedAt: new Date() })
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

// Retry main-agent creation for VPS instances that are fully up (bridge
// deployed, bridgeBaseUrl stored) but whose allocation is still waiting_init
// because the initial agent-creation attempt failed.
async function retryAgentInit(db: Awaited<ReturnType<typeof getDb>>) {
  const pending = await db
    .select()
    .from(runtimeAllocation)
    .where(
      and(
        eq(runtimeAllocation.status, 'waiting_init'),
        sql`${runtimeAllocation.bridgeBaseUrl} IS NOT NULL`
      )
    );

  for (const alloc of pending) {
    if (!alloc.bridgeBaseUrl || !alloc.bridgeToken) continue;
    try {
      const res = await fetch(`${alloc.bridgeBaseUrl}/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${alloc.bridgeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'main',
          name: 'Main Agent',
          model: 'openrouter/openai/gpt-4o-mini',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok || res.status === 409) {
        // Verify the gateway WS session is actually usable before marking ready.
        // Agent creation can trigger a gateway hot-reload; /ready waits for WS
        // handshake to succeed so the user won't hit "Gateway connect timed out".
        const readyRes = await fetch(`${alloc.bridgeBaseUrl}/ready`, {
          headers: { Authorization: `Bearer ${alloc.bridgeToken}` },
          signal: AbortSignal.timeout(20_000),
        }).catch(() => null);
        if (!readyRes?.ok) {
          console.warn(`[provision] Agent init retry: agent created but /ready not yet OK for user ${alloc.userId}`);
          continue;
        }
        await db
          .update(runtimeAllocation)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(runtimeAllocation.id, alloc.id));
        console.log(`[provision] Agent init retry succeeded for user ${alloc.userId}`);
      } else {
        console.warn(`[provision] Agent init retry got ${res.status} for user ${alloc.userId}`);
      }
    } catch (err) {
      console.error(`[provision] Agent init retry failed for user ${alloc.userId}:`, err);
    }
  }
}

// Fallback: stop VPS for users whose subscription has expired but the
// Stripe webhook was missed or delayed.
async function stopExpiredSubscriptionVps(
  db: Awaited<ReturnType<typeof getDb>>
) {
  // Find users with a running VPS who have no active paid plan.
  const activeAllocs = await db
    .select({ userId: runtimeAllocation.userId })
    .from(runtimeAllocation)
    .where(eq(runtimeAllocation.status, 'ready'));

  if (activeAllocs.length === 0) return;

  const activeUserIds = activeAllocs.map((r) => r.userId);

  // Users with a valid active plan (subscription still in period, or lifetime).
  const validPayments = await db
    .select({ userId: payment.userId })
    .from(payment)
    .where(
      and(
        eq(payment.paid, true),
        inArray(payment.userId, activeUserIds),
        sql`(
          (${payment.scene} = 'lifetime' AND ${payment.status} = 'active')
          OR (${payment.scene} = 'subscription'
              AND ${payment.status} IN ('active', 'trialing', 'canceled')
              AND (${payment.periodEnd} IS NULL OR ${payment.periodEnd} > NOW()))
        )`
      )
    );

  const coveredUserIds = new Set(validPayments.map((r) => r.userId));
  const expiredUserIds = activeUserIds.filter((id) => !coveredUserIds.has(id));

  for (const userId of expiredUserIds) {
    console.log(
      `[provision] Subscription expired for user ${userId}, stopping VPS`
    );
    await stopRuntimeForUser(userId).catch((err) =>
      console.error(`[provision] Failed to stop VPS for expired user ${userId}:`, err)
    );
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

    await retryAgentInit(db);
    await stopExpiredSubscriptionVps(db);
    await cleanupExpiredVps(db);
  } catch (err) {
    console.error('[provision] Worker error:', err);
  }
}

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { hetznerProject, runtimeAllocation, runtimeHost, runtimeProvisionJob } from '@/db/schema';
import { hetznerClient } from '@/lib/hetzner/client';
import { findPlanByPriceId } from '@/lib/price-plan';

function derivePlanFromPriceId(priceId: string | null): 'pro' | 'premium' | 'ultra' {
  if (!priceId) return 'pro';
  const plan = findPlanByPriceId(priceId);
  if (!plan) return 'pro';
  if (plan.id.startsWith('ultra')) return 'ultra';
  if (plan.id.startsWith('premium')) return 'premium';
  return 'pro';
}

export async function queueRuntimeProvision(userId: string, priceId: string | null) {
  const db = await getDb();
  const plan = derivePlanFromPriceId(priceId);

  // Check if user already has a stopped VPS → poweron instead of new provision
  const [existingHost] = await db
    .select()
    .from(runtimeHost)
    .where(and(eq(runtimeHost.userId, userId), eq(runtimeHost.status, 'stopped')))
    .limit(1);

  if (existingHost?.hetznerServerId && existingHost.projectId) {
    const [project] = await db
      .select()
      .from(hetznerProject)
      .where(eq(hetznerProject.id, existingHost.projectId))
      .limit(1);

    if (project) {
      await hetznerClient(project.apiToken).poweron(Number(existingHost.hetznerServerId));
      await db
        .update(runtimeHost)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(runtimeHost.id, existingHost.id));
      await db
        .update(runtimeAllocation)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(runtimeAllocation.userId, userId));
      console.log(`[provision] Powered on existing VPS for user ${userId}`);
      return;
    }
  }

  // New provision job
  await db.insert(runtimeProvisionJob).values({
    id: randomUUID(),
    userId,
    plan,
    triggerType: existingHost ? 'payment_resubscribe' : 'payment_new',
    status: 'pending',
  });

  // Create/update allocation to 'pending' so runtime-status shows provisioning immediately
  await db
    .insert(runtimeAllocation)
    .values({ id: randomUUID(), userId, plan, status: 'pending' })
    .onConflictDoUpdate({
      target: runtimeAllocation.userId,
      set: { plan, status: 'pending', updatedAt: new Date() },
    });

  console.log(`[provision] Queued provision job for user ${userId} (plan: ${plan})`);
}

export async function stopRuntimeForUser(userId: string) {
  const db = await getDb();
  const [host] = await db
    .select()
    .from(runtimeHost)
    .where(and(eq(runtimeHost.userId, userId), eq(runtimeHost.status, 'ready')))
    .limit(1);

  if (!host?.hetznerServerId || !host.projectId) return;

  const [project] = await db
    .select()
    .from(hetznerProject)
    .where(eq(hetznerProject.id, host.projectId))
    .limit(1);

  if (!project) return;

  await hetznerClient(project.apiToken).poweroff(Number(host.hetznerServerId));
  await db
    .update(runtimeHost)
    .set({ status: 'stopped', stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(runtimeHost.id, host.id));
  await db
    .update(runtimeAllocation)
    .set({ status: 'stopped', updatedAt: new Date() })
    .where(eq(runtimeAllocation.userId, userId));

  console.log(`[provision] Powered off VPS for user ${userId}`);
}

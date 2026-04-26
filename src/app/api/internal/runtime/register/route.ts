import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'crypto';
import { jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { runtimeAllocation, runtimeHost, runtimeProvisionJob } from '@/db/schema';
import { NextResponse } from 'next/server';

const execAsync = promisify(exec);
const SSH_KEY = '/home/openclaw/.ssh/myclawgo_runtime';
const BRIDGE_SRC = '/home/openclaw/project/my-claw-go/bridge';

async function deployBridgeToVps(publicIp: string, bridgeToken: string) {
  await execAsync(
    `scp -i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
      -r ${BRIDGE_SRC}/dist ${BRIDGE_SRC}/package.json ${BRIDGE_SRC}/package-lock.json \
      root@${publicIp}:/opt/myclawgo-bridge/`,
    { timeout: 120_000 },
  );

  await execAsync(
    `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=15 root@${publicIp} \
      "cd /opt/myclawgo-bridge && npm install --production && \
       chown -R openclaw:openclaw /opt/myclawgo-bridge && \
       printf 'BRIDGE_TOKEN=${bridgeToken}\\nGATEWAY_WS_URL=ws://127.0.0.1:18789\\nPORT=18080\\n' > /etc/myclawgo/bridge.env && \
       systemctl enable myclawgo-bridge && systemctl start myclawgo-bridge"`,
    { timeout: 120_000 },
  );

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`http://${publicIp}:18080/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
    } catch { /* not ready yet */ }
  }
  throw new Error(`Bridge health check timeout on ${publicIp}`);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId: string;
  let jobId: string;
  try {
    const secret = new TextEncoder().encode(process.env.RUNTIME_REGISTER_TOKEN_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    userId = payload.userId as string;
    jobId = payload.jobId as string;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const body = await req.json();
  const publicIp: string = body.publicIp;
  if (!publicIp) {
    return NextResponse.json({ error: 'Missing publicIp' }, { status: 400 });
  }

  const db = await getDb();
  const [host] = await db
    .select()
    .from(runtimeHost)
    .where(and(eq(runtimeHost.userId, userId), eq(runtimeHost.status, 'waiting_init')))
    .limit(1);

  if (!host) {
    return NextResponse.json({ error: 'No host in waiting_init state' }, { status: 404 });
  }

  const bridgeBaseUrl = `http://${publicIp}:18080`;

  try {
    await deployBridgeToVps(publicIp, host.bridgeToken!);
  } catch (err) {
    console.error(`[register] Bridge deploy failed for user ${userId}:`, err);
    await db
      .update(runtimeHost)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(runtimeHost.id, host.id));
    await db
      .update(runtimeProvisionJob)
      .set({ status: 'failed', lastError: String(err), updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, jobId));
    return NextResponse.json({ error: 'Bridge deploy failed' }, { status: 500 });
  }

  await db
    .update(runtimeHost)
    .set({ publicIp, bridgeBaseUrl, status: 'ready', updatedAt: new Date() })
    .where(eq(runtimeHost.id, host.id));

  await db
    .insert(runtimeAllocation)
    .values({
      id: randomUUID(),
      userId,
      hostId: host.id,
      plan: host.plan,
      bridgeBaseUrl,
      bridgeToken: host.bridgeToken,
      status: 'ready',
    })
    .onConflictDoUpdate({
      target: runtimeAllocation.userId,
      set: {
        hostId: host.id,
        plan: host.plan,
        bridgeBaseUrl,
        bridgeToken: host.bridgeToken,
        status: 'ready',
        updatedAt: new Date(),
      },
    });

  await db
    .update(runtimeProvisionJob)
    .set({ status: 'done', updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, jobId));

  console.log(`[register] VPS ready for user ${userId} at ${publicIp}`);
  return NextResponse.json({ ok: true });
}

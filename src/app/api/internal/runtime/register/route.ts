import { randomUUID } from 'crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from '@/db';
import {
  runtimeAllocation,
  runtimeHost,
  runtimeProvisionJob,
  userAgentDoc,
  userGroup,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { getUserOpenrouterKey } from '@/lib/myclawgo/openrouter-key-provisioner';

const execAsync = promisify(exec);
const SSH_KEY = '/home/openclaw/.ssh/myclawgo_runtime';
const BRIDGE_SRC = '/home/openclaw/project/my-claw-go/bridge';

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildAuthProfileJson(apiKey: string): string {
  return JSON.stringify(
    {
      version: 1,
      profiles: {
        'openrouter:default': {
          type: 'api_key',
          provider: 'openrouter',
          key: apiKey,
        },
      },
      lastGood: { openrouter: 'openrouter:default' },
      usageStats: {},
    },
    null,
    2
  );
}

async function deployBridgeToVps(
  publicIp: string,
  bridgeToken: string,
  openrouterKey: string,
  appUrl: string,
  userId: string,
) {
  const sshBase = [
    'ssh',
    '-i',
    shellQuote(SSH_KEY),
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'ConnectTimeout=15',
    `root@${shellQuote(publicIp)}`,
  ].join(' ');

  await execAsync(
    `test -d ${shellQuote(`${BRIDGE_SRC}/dist`)} && \
     scp -i ${shellQuote(SSH_KEY)} -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
      -r ${shellQuote(`${BRIDGE_SRC}/dist`)} ${shellQuote(`${BRIDGE_SRC}/package.json`)} \
      root@${shellQuote(publicIp)}:/opt/myclawgo-bridge/`,
    { timeout: 120_000 }
  );

  await execAsync(
    `${sshBase} "
      cd /opt/myclawgo-bridge && npm install --omit=dev && \
      chown -R openclaw:openclaw /opt/myclawgo-bridge && \
      printf '%s\\n' ${shellQuote(`BRIDGE_TOKEN=${bridgeToken}`)} 'GATEWAY_WS_URL=ws://127.0.0.1:18789' 'BRIDGE_PORT=18080' ${shellQuote(`MYCLAWGO_APP_URL=${appUrl}`)} > /etc/myclawgo/bridge.env && \
      sed -i 's|ExecStart=.*openclaw gateway run.*|ExecStart=/usr/bin/openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789|' /etc/systemd/system/openclaw-gateway.service && \
      sed -i 's|ExecStart=/usr/bin/node dist/index.js|ExecStart=/usr/bin/node dist/server.js|' /etc/systemd/system/myclawgo-bridge.service && \
      systemctl daemon-reload && \
      systemctl restart openclaw-gateway && \
      sleep 2 && \
      systemctl enable myclawgo-bridge && systemctl restart myclawgo-bridge
    "`,
    { timeout: 120_000 }
  );

  // Fix agents directory ownership (gateway creates it as root during first-boot)
  // and write OpenRouter auth key so gateway can call AI providers.
  // The gateway creates agents/main as root on first start.
  // We chown after restart+sleep so the bridge (openclaw user) can write there.
  const authSteps = openrouterKey
    ? `mkdir -p /home/openclaw/.openclaw/agents/main/agent && \
       printf '%s' ${shellQuote(Buffer.from(buildAuthProfileJson(openrouterKey)).toString('base64'))} | base64 -d > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json && \
       systemctl restart openclaw-gateway && \
       sleep 4 && \
       chown -R openclaw:openclaw /home/openclaw/.openclaw`
    : `systemctl restart openclaw-gateway && \
       sleep 4 && \
       chown -R openclaw:openclaw /home/openclaw/.openclaw`;

  await execAsync(`${sshBase} "${authSteps}"`, { timeout: 60_000 });

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`http://${publicIp}:18080/health`, {
        headers: { Authorization: `Bearer ${bridgeToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        // Create the default main agent with retries — the gateway may not
        // have written openclaw.json yet even though /health already passes.
        let agentReady = false;
        for (let attempt = 1; attempt <= 4; attempt++) {
          if (attempt > 1) await new Promise((r) => setTimeout(r, 3000));
          const createAgentRes = await fetch(`http://${publicIp}:18080/agents`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${bridgeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              agentId: 'main',
              name: 'Main Agent',
              model: 'openrouter/openai/gpt-4o-mini',
            }),
            signal: AbortSignal.timeout(10_000),
          }).catch((e) => {
            console.warn(`[register] create main agent attempt ${attempt} network error:`, e);
            return null;
          });
          if (!createAgentRes) continue;
          if (createAgentRes.ok || createAgentRes.status === 409) {
            agentReady = true;
            break;
          }
          const body = await createAgentRes.text().catch(() => '');
          console.error(`[register] create main agent attempt ${attempt} failed (${createAgentRes.status}):`, body);
        }

        if (!agentReady) {
          // VPS and bridge are up, but main agent couldn't be initialized.
          // Throw a typed error so the caller can keep the VPS as ready but
          // allocation as waiting_init — the provision worker will retry.
          throw Object.assign(
            new Error(`Main agent init failed on ${publicIp} after all retries`),
            { code: 'AGENT_INIT_FAILED' }
          );
        }

        // Restore backed-up agent docs and groups from PG.
        await restoreFromPg(publicIp, bridgeToken, userId).catch((e) =>
          console.warn('[register] restore from PG failed (non-fatal):', e)
        );

        return;
      }
    } catch {
      /* not ready yet */
    }
  }
  throw new Error(`Bridge health check timeout on ${publicIp}`);
}

async function restoreFromPg(publicIp: string, bridgeToken: string, userId: string) {
  const db = await getDb();
  const bridgeBase = `http://${publicIp}:18080`;
  const authHeaders = {
    Authorization: `Bearer ${bridgeToken}`,
    'Content-Type': 'application/json',
  };

  // Restore agent docs
  const docs = await db
    .select()
    .from(userAgentDoc)
    .where(eq(userAgentDoc.userId, userId));

  for (const doc of docs) {
    await fetch(
      `${bridgeBase}/agents/${encodeURIComponent(doc.agentId)}/docs/${doc.docKey}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ content: doc.content }),
        signal: AbortSignal.timeout(10_000),
      }
    ).catch((e) =>
      console.warn(`[register] restore doc ${doc.agentId}/${doc.docKey} failed:`, e)
    );
  }

  // Restore groups (agents need to exist first; bridge will reject missing leaders)
  const groups = await db
    .select()
    .from(userGroup)
    .where(eq(userGroup.userId, userId));

  for (const g of groups) {
    await fetch(`${bridgeBase}/groups`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        id: g.groupId,
        name: g.name,
        description: g.description,
        leaderId: g.leaderId,
        members: g.members,
        relay: g.relay,
        channels: g.channels,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((e) =>
      console.warn(`[register] restore group ${g.groupId} failed:`, e)
    );
  }

  console.log(`[register] restored ${docs.length} docs and ${groups.length} groups for user ${userId}`);
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
    const secret = new TextEncoder().encode(
      process.env.RUNTIME_REGISTER_TOKEN_SECRET!
    );
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
    .where(
      and(
        eq(runtimeHost.userId, userId),
        eq(runtimeHost.status, 'waiting_init')
      )
    )
    .limit(1);

  if (!host) {
    return NextResponse.json(
      { error: 'No host in waiting_init state' },
      { status: 404 }
    );
  }

  const bridgeBaseUrl = `http://${publicIp}:18080`;

  const openrouterKey =
    (await getUserOpenrouterKey(userId)) ??
    process.env.OPENROUTER_API_KEY ??
    '';
  if (!openrouterKey) {
    console.warn(
      `[register] No OpenRouter key for user ${userId} — gateway will start without AI auth`
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  const isAgentInitFailed =
    (err: unknown): err is Error =>
      err instanceof Error && (err as any).code === 'AGENT_INIT_FAILED';

  try {
    await deployBridgeToVps(publicIp, host.bridgeToken!, openrouterKey, appUrl, userId);
  } catch (err) {
    if (isAgentInitFailed(err)) {
      // Bridge is up, VPS is healthy — only the agent init failed.
      // Mark VPS as ready and save bridge connection info, but keep
      // allocation in waiting_init so the chat page stays in the
      // provisioning view. The provision worker will retry agent creation.
      console.warn(`[register] Agent init failed for user ${userId}, will retry via worker`);
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
          status: 'waiting_init',
        })
        .onConflictDoUpdate({
          target: runtimeAllocation.userId,
          set: {
            hostId: host.id,
            plan: host.plan,
            bridgeBaseUrl,
            bridgeToken: host.bridgeToken,
            status: 'waiting_init',
            updatedAt: new Date(),
          },
        });
      await db
        .update(runtimeProvisionJob)
        .set({ status: 'done', updatedAt: new Date() })
        .where(eq(runtimeProvisionJob.id, jobId));
      return NextResponse.json({ ok: true });
    }

    console.error(`[register] Bridge deploy failed for user ${userId}:`, err);
    await db
      .update(runtimeHost)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(runtimeHost.id, host.id));
    await db
      .update(runtimeProvisionJob)
      .set({ status: 'failed', lastError: String(err), updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, jobId));
    await db
      .update(runtimeAllocation)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(runtimeAllocation.userId, userId));
    return NextResponse.json(
      { error: 'Bridge deploy failed' },
      { status: 500 }
    );
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

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { PaymentTypes } from '@/payment/types';
import { and, desc, eq, or } from 'drizzle-orm';
import { getCommandTimeoutMs, isSafeCommandInput } from './command-policy';
import type { UserSession } from './session-store';

const execFileAsync = promisify(execFile);

const OPENCLAW_IMAGE =
  process.env.MYCLAWGO_OPENCLAW_IMAGE || 'myclawgo-openclaw:2026.3.8';
const HOST_OPENCLAW_CONFIG =
  process.env.MYCLAWGO_SEED_CONFIG_PATH ||
  '/home/openclaw/docker-openclaw-seed/openclaw.json';
const HOST_AUTH_PROFILES =
  process.env.MYCLAWGO_SEED_AUTH_PATH ||
  '/home/openclaw/docker-openclaw-seed/auth-profiles.json';
const HOST_PW_DIR =
  process.env.MYCLAWGO_PW_DIR || '/home/openclaw/docker-openclaw-pw';
const DEFAULT_RUNTIME_MODEL =
  process.env.MYCLAWGO_RUNTIME_MODEL || 'openrouter/minimax/minimax-m2.5';
const OPENCLAW_NPM_SPEC = process.env.MYCLAWGO_OPENCLAW_NPM_SPEC || 'latest';
const ALLOW_LEGACY_BOOTSTRAP =
  process.env.MYCLAWGO_ALLOW_LEGACY_BOOTSTRAP === 'true';

const ensureContainerLocks = new Map<string, Promise<{ ok: true; mode: 'started-existing' | 'created' } | { ok: false; error: string }>>();

type RuntimeTier = 'pro' | 'premium' | 'ultra';

type ContainerLimits = {
  cpus: string;
  memory: string;
  disk: string;
};

const RUNTIME_LIMITS_BY_TIER: Record<RuntimeTier, ContainerLimits> = {
  pro: { cpus: '0.5', memory: '1g', disk: '10g' },
  premium: { cpus: '1', memory: '2g', disk: '20g' },
  ultra: { cpus: '4', memory: '8g', disk: '50g' },
};

function priceIdTier(priceId: string | null | undefined): RuntimeTier {
  if (!priceId) return 'pro';

  const premiumIds = [
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY,
  ].filter(Boolean);
  if (premiumIds.includes(priceId)) return 'premium';

  const ultraIds = [
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTRA_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTRA_YEARLY,
  ].filter(Boolean);
  if (ultraIds.includes(priceId)) return 'ultra';

  return 'pro';
}

async function getContainerLimitsForUser(
  userId: string
): Promise<ContainerLimits> {
  try {
    const db = await getDb();

    // Check active subscription first
    const sub = await db
      .select({ priceId: payment.priceId })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.SUBSCRIPTION),
          eq(payment.paid, true),
          or(eq(payment.status, 'active'), eq(payment.status, 'trialing'))
        )
      )
      .orderBy(desc(payment.createdAt))
      .limit(1);

    if (sub[0]?.priceId) {
      return RUNTIME_LIMITS_BY_TIER[priceIdTier(sub[0].priceId)];
    }

    // Lifetime users get premium tier
    const lifetime = await db
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.ONE_TIME),
          eq(payment.paid, true),
          eq(payment.status, 'completed')
        )
      )
      .limit(1);

    if (lifetime.length > 0) {
      return RUNTIME_LIMITS_BY_TIER.premium;
    }

    return RUNTIME_LIMITS_BY_TIER.pro;
  } catch {
    return RUNTIME_LIMITS_BY_TIER.pro;
  }
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

function extractJsonObjectFromStdout(stdout: string): unknown | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // 1. Try direct parse (JSON is the entire stdout)
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Find last top-level JSON object starting with newline
  const jsonStart = trimmed.lastIndexOf('\n{');
  if (jsonStart >= 0) {
    try {
      return JSON.parse(trimmed.slice(jsonStart + 1).trim());
    } catch {
      // continue
    }
  }

  // 3. Find first { and try from there
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace >= 0) {
    try {
      return JSON.parse(trimmed.slice(firstBrace));
    } catch {
      // continue
    }
  }

  return null;
}

function formatCommandOutput(rawOutput: string, command: string): string {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === '(no output)') {
    return '✅ Done.';
  }
  // Truncate at 20k chars to avoid UI overflow
  const out =
    trimmed.length > 20_000
      ? `${trimmed.slice(0, 20_000)}\n\n...(output truncated)...`
      : trimmed;
  return out;
}

async function dockerExec(
  containerName: string,
  cmd: string,
  timeoutMs = 20_000
) {
  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['exec', containerName, 'sh', '-lc', cmd],
    {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }
  );
  return { stdout, stderr };
}

function generateStrongPassword(length = 24) {
  const raw = crypto.randomBytes(length).toString('base64url');
  return `${raw}A1!`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSessionPassword(containerName: string) {
  await fs.mkdir(HOST_PW_DIR, { recursive: true });
  const pwFile = path.join(HOST_PW_DIR, containerName);
  try {
    const existing = (await fs.readFile(pwFile, 'utf-8')).trim();
    if (existing) return existing;
  } catch {
    // create below
  }

  const password = generateStrongPassword();
  await fs.writeFile(pwFile, `${password}\n`, { mode: 0o600 });
  return password;
}

async function prepareSeededRuntime(containerName: string) {
  const sessionPassword = await ensureSessionPassword(containerName);

  const script = [
    'set -e',
    'mkdir -p /home/openclaw/.openclaw /home/openclaw/.openclaw/agents/main/agent',
    `echo 'openclaw:${sessionPassword}' | chpasswd`,
    'if [ -f /seed/openclaw.json ] && [ ! -f /home/openclaw/.openclaw/openclaw.json ]; then cp /seed/openclaw.json /home/openclaw/.openclaw/openclaw.json; fi',
    'if [ -f /seed/auth-profiles.json ] && [ ! -f /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json ]; then cp /seed/auth-profiles.json /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json; fi',
    'chown -R openclaw:openclaw /home/openclaw/.openclaw',
    "su - openclaw -c 'openclaw models set openrouter/minimax/minimax-m2.5 || true'",
  ].join('; ');

  await dockerExec(containerName, script);
}

async function bootstrapOpenClaw(containerName: string) {
  const sessionPassword = await ensureSessionPassword(containerName);

  const script = [
    'set -e',
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update',
    'apt-get install -y sudo curl git ca-certificates procps less vim nano bash python3',
    'id -u openclaw >/dev/null 2>&1 || useradd -m -s /bin/bash openclaw',
    `echo 'openclaw:${sessionPassword}' | chpasswd`,
    'usermod -aG sudo openclaw',
    "echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw",
    'chmod 0440 /etc/sudoers.d/openclaw',
    'mkdir -p /home/openclaw/.openclaw /home/openclaw/.openclaw/agents/main/agent',
    'chown -R openclaw:openclaw /home/openclaw/.openclaw',
    'if [ -f /seed/openclaw.json ] && [ ! -f /home/openclaw/.openclaw/openclaw.json ]; then cp /seed/openclaw.json /home/openclaw/.openclaw/openclaw.json; fi',
    'if [ -f /seed/auth-profiles.json ] && [ ! -f /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json ]; then cp /seed/auth-profiles.json /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json; fi',
    'chown -R openclaw:openclaw /home/openclaw/.openclaw',
    'su - openclaw -c "if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs; fi"',
    `su - openclaw -c 'if ! command -v openclaw >/dev/null 2>&1; then sudo npm install -g openclaw@${OPENCLAW_NPM_SPEC}; fi'`,
    "su - openclaw -c 'openclaw models set openrouter/minimax/minimax-m2.5 || true'",
    'su - openclaw -c \'pgrep -f "openclaw gateway run" >/dev/null || nohup openclaw gateway run --auth none --bind loopback --port 18789 > /home/openclaw/.openclaw/gateway.log 2>&1 &\'',
  ].join('; ');

  await dockerExec(containerName, script);
}

async function ensureGatewayForContainer(containerName: string) {
  // Write keep-alive script via docker exec --user (avoids permission issues with uid mismatch)
  const scriptContent = [
    '#!/bin/bash',
    'while true; do',
    '  openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789 >> /home/openclaw/.openclaw/gateway.log 2>&1',
    '  sleep 2',
    'done',
  ].join('\n');
  // Write script if not present
  await execFileAsync('docker', [
    'exec',
    '--user',
    'openclaw',
    containerName,
    'bash',
    '-c',
    `[ -f /home/openclaw/.openclaw/keep-gateway.sh ] || printf '%s' ${JSON.stringify(scriptContent)} > /home/openclaw/.openclaw/keep-gateway.sh && chmod +x /home/openclaw/.openclaw/keep-gateway.sh`,
  ]).catch(() => {});
  // Start keep-alive via docker exec -d (detached, survives exec session)
  const running = await execFileAsync('docker', [
    'exec',
    '--user',
    'openclaw',
    containerName,
    'bash',
    '-c',
    'pgrep -f keep-gateway.sh >/dev/null 2>&1 && echo yes || echo no',
  ])
    .then(({ stdout }) => stdout.trim() === 'yes')
    .catch(() => false);
  if (!running) {
    await execFileAsync('docker', [
      'exec',
      '-d',
      '--user',
      'openclaw',
      containerName,
      'bash',
      '/home/openclaw/.openclaw/keep-gateway.sh',
    ]).catch(() => {});
  }
}

export async function ensureUserContainer(session: UserSession) {
  const containerName = safeName(session.containerName);

  const existing = ensureContainerLocks.get(containerName);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    console.log(
      `[MyClawGo] Ensuring container ${containerName} for user ${session.id}`
    );
    try {
      await execFileAsync('docker', ['start', containerName]);
      const checkCmd =
        "su - openclaw -c 'which openclaw 2>/dev/null && echo ready || echo not_ready'";
      const { stdout: checkOut } = await dockerExec(containerName, checkCmd).catch(
        () => ({ stdout: 'not_ready' })
      );
      if (!checkOut.includes('ready')) {
        if (!ALLOW_LEGACY_BOOTSTRAP) {
          return {
            ok: false as const,
            error:
              'Container exists but runtime is missing. Legacy online bootstrap is disabled; recreate this container from the prebuilt runtime image.',
          };
        }
        await bootstrapOpenClaw(containerName);
        return { ok: true as const, mode: 'created' as const };
      }
      await prepareSeededRuntime(containerName);
      await ensureGatewayForContainer(containerName).catch(() => {});
      return { ok: true as const, mode: 'started-existing' as const };
    } catch {
      // continue and create
    }

    const envs = ['OPENROUTER_API_KEY']
      .map((k) => ({ key: k, value: process.env[k] }))
      .filter((e) => Boolean(e.value));

    envs.push({
      key: 'BRIDGE_TOKEN',
      value: process.env.MYCLAWGO_BRIDGE_TOKEN || 'bridge-test-token',
    });

    const limits = await getContainerLimitsForUser(session.id);
    const args = [
      'run',
      '-d',
      '--name',
      containerName,
      '--cpus',
      limits.cpus,
      '--memory',
      limits.memory,
      '--memory-swap',
      limits.memory,
      '--storage-opt',
      `size=${limits.disk}`,
      '-v',
      `${session.userDataDir}:/home/openclaw/.openclaw`,
      '-v',
      `${HOST_OPENCLAW_CONFIG}:/seed/openclaw.json:ro`,
      '-v',
      `${HOST_AUTH_PROFILES}:/seed/auth-profiles.json:ro`,
      '-w',
      '/root',
    ];

    for (const env of envs) {
      args.push('-e', `${env.key}=${env.value}`);
    }

    args.push(OPENCLAW_IMAGE, 'sleep-infinity');

    try {
      await execFileAsync('docker', args);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown docker error';
      if (
        message.includes('--storage-opt is supported only for overlay over xfs')
      ) {
        const argsWithoutDisk = args.filter((_, idx) => {
          if (args[idx] === '--storage-opt') return false;
          if (idx > 0 && args[idx - 1] === '--storage-opt') return false;
          return true;
        });
        await execFileAsync('docker', argsWithoutDisk);
      } else if (
        message.includes('is already in use by container') ||
        message.includes('Conflict. The container name')
      ) {
        await execFileAsync('docker', ['start', containerName]).catch(() => {});
        return { ok: true as const, mode: 'started-existing' as const };
      } else {
        return {
          ok: false as const,
          error: message,
        };
      }
    }

    try {
      await prepareSeededRuntime(containerName);
      await ensureGatewayForContainer(containerName).catch(() => {});
      return { ok: true as const, mode: 'created' as const };
    } catch (error: unknown) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Unknown docker error',
      };
    }
  })();

  ensureContainerLocks.set(containerName, run);
  try {
    return await run;
  } finally {
    ensureContainerLocks.delete(containerName);
  }
}


function parseAgentJsonOutput(stdout: string) {
  const rawParsed = extractJsonObjectFromStdout(stdout) as {
    payloads?: Array<{ text?: string }>;
    meta?: {
      agentMeta?: {
        model?: string;
        usage?: { input?: number; output?: number; total?: number };
        lastCallUsage?: { input?: number; output?: number; total?: number };
      };
    };
    result?: {
      payloads?: Array<{ text?: string }>;
      meta?: {
        agentMeta?: {
          model?: string;
          usage?: { input?: number; output?: number; total?: number };
          lastCallUsage?: { input?: number; output?: number; total?: number };
        };
      };
    };
  } | null;

  const parsed =
    (rawParsed as { result?: typeof rawParsed })?.result ?? rawParsed;

  const payloadText =
    parsed?.payloads
      ?.map((p) => p?.text || '')
      .filter(Boolean)
      .join('\\n\\n')
      .trim() || '';

  const model = parsed?.meta?.agentMeta?.model || DEFAULT_RUNTIME_MODEL;
  const usageSource =
    parsed?.meta?.agentMeta?.lastCallUsage || parsed?.meta?.agentMeta?.usage;

  return {
    payloadText,
    rawText: stdout.trim(),
    model,
    usage: usageSource
      ? {
          inputTokens: Math.max(0, Number(usageSource.input || 0)),
          outputTokens: Math.max(0, Number(usageSource.output || 0)),
          totalTokens: Math.max(0, Number(usageSource.total || 0)),
        }
      : undefined,
  };
}


export async function checkUserContainerReady(session: UserSession) {
  const containerName = safeName(session.containerName);

  try {
    await execFileAsync('docker', ['start', containerName]);
  } catch {
    return { ready: false as const, phase: 'container-missing' as const };
  }

  const checkCmd =
    "su - openclaw -c 'which openclaw 2>/dev/null && echo ready || echo not_ready'";
  const { stdout: checkOut } = await dockerExec(containerName, checkCmd).catch(
    () => ({ stdout: 'not_ready' })
  );
  if (!checkOut.includes('ready')) {
    return { ready: false as const, phase: 'runtime-installing' as const };
  }

  await ensureGatewayForContainer(containerName).catch(() => {});

  const { stdout: gatewayState } = await dockerExec(
    containerName,
    "sh -lc \"pgrep -f 'keep-gateway.sh|openclaw gateway run' >/dev/null 2>&1 && echo running || echo starting; if grep -q '\\[gateway\\] listening on ws://127.0.0.1:18789' /home/openclaw/.openclaw/gateway.log 2>/dev/null; then echo listening; fi\"",
    5_000
  ).catch(() => ({ stdout: '' }));

  if (gatewayState.includes('listening') || gatewayState.includes('running')) {
    return { ready: true as const, phase: 'ready' as const };
  }

  return { ready: false as const, phase: 'gateway-starting' as const };
}

async function cleanupStaleSessionLocks(containerName: string) {
  const script = String.raw`sh -lc 'find /home/openclaw/.openclaw/agents -path "*/sessions/*.jsonl.lock" -type f 2>/dev/null | while read -r f; do pid=$(sed -n "s/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*//p" "$f" | head -n1); if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then continue; fi; rm -f "$f"; done'`;
  await dockerExec(containerName, script, 10_000).catch(() => {});
}

export async function runOpenClawChatInContainer(
  session: UserSession,
  message: string
) {
  const containerName = safeName(session.containerName);

  await execFileAsync('docker', ['start', containerName]).catch(() => {});

  const checkCmd =
    "su - openclaw -c 'which openclaw 2>/dev/null && echo ready || echo not_ready'";

  let runtimeReady = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { stdout: checkOut } = await dockerExec(containerName, checkCmd).catch(
      () => ({ stdout: 'not_ready' })
    );
    if (checkOut.includes('ready')) {
      runtimeReady = true;
      break;
    }
    await sleep(2000);
  }

  if (!runtimeReady) {
    return {
      ok: false as const,
      error:
        '🚀 Your workspace is still initializing (installing OpenClaw runtime). This takes about 1–2 minutes on first launch. Please wait a moment and try again.',
      isInitializing: true,
    };
  }

  await ensureGatewayForContainer(containerName).catch(() => {});
  await cleanupStaleSessionLocks(containerName);

  let gatewayReady = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { stdout: healthOut } = await dockerExec(
      containerName,
      "su - openclaw -c 'openclaw gateway call health --json 2>/dev/null | head -1'",
      5_000
    ).catch(() => ({ stdout: '' }));
    if (healthOut.includes('{')) {
      gatewayReady = true;
      break;
    }
    await sleep(1500);
  }

  const cmd = gatewayReady
    ? `su - openclaw -c ${JSON.stringify(
        `openclaw agent --agent main --message ${JSON.stringify(message)} --thinking off --json`
      )}`
    : `su - openclaw -c ${JSON.stringify(
        `openclaw agent --local --agent main --message ${JSON.stringify(message)} --thinking off --json`
      )}`;

  try {
    const { stdout } = await dockerExec(containerName, cmd, 90_000);
    let parsed = parseAgentJsonOutput(stdout);

    if (!parsed.payloadText && !parsed.rawText) {
      await sleep(1200);
      const retry = await dockerExec(containerName, cmd, 90_000);
      parsed = parseAgentJsonOutput(retry.stdout);
    }

    if (!parsed.payloadText && !parsed.rawText) {
      return {
        ok: false as const,
        error: 'Runtime returned empty response. Please retry your message.',
      };
    }

    return {
      ok: true as const,
      reply: parsed.payloadText || parsed.rawText,
      model: parsed.model,
      usage: parsed.usage,
    };
  } catch (error: unknown) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to execute containerized OpenClaw',
    };
  }
}

export async function runWhitelistedCommandInContainer(
  session: UserSession,
  command: string
) {
  const containerName = safeName(session.containerName);

  if (!isSafeCommandInput(command)) {
    return {
      ok: false as const,
      error:
        'Command not allowed. Only safe OpenClaw/ClawHub commands without shell operators are supported.',
    };
  }

  await execFileAsync('docker', ['start', containerName]).catch(() => {});

  const wrapped = `su - openclaw -c ${JSON.stringify(command)}`;
  const timeoutMs = getCommandTimeoutMs(command);
  try {
    const { stdout, stderr } = await dockerExec(
      containerName,
      wrapped,
      timeoutMs
    );
    const merged = `${stdout || ''}${stderr || ''}`.trim() || '(no output)';
    const output = formatCommandOutput(merged, command);
    return { ok: true as const, output };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Container command failed';
    if (message.includes('timed out')) {
      return {
        ok: false as const,
        error: `Command timed out after ${Math.floor(timeoutMs / 1000)}s. Please retry with a shorter or simpler command. If this is a package installation, it can take up to 2 minutes.`,
      };
    }
    const lower = message.toLowerCase();
    if (
      lower.includes('no such container') ||
      lower.includes('is not running') ||
      lower.includes('cannot connect to the docker daemon') ||
      lower.includes('container not found')
    ) {
      return {
        ok: false as const,
        error:
          'Runtime container is not ready. Please try again or contact support.',
      };
    }
    return {
      ok: false as const,
      error: message,
    };
  }
}

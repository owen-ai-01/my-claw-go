import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getCommandTimeoutMs, isSafeCommandInput } from './command-policy';
import type { UserSession } from './session-store';

const execFileAsync = promisify(execFile);

const OPENCLAW_IMAGE = process.env.MYCLAWGO_OPENCLAW_IMAGE || 'ubuntu:24.04';
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
    return '✅ Command executed successfully (no output).';
  }

  // 应用截断逻辑（保留现有逻辑）
  const truncated =
    trimmed.length > 8_000
      ? `${trimmed.slice(0, 8_000)}\n\n...output truncated...`
      : trimmed;

  // 简单格式化：添加命令上下文和分隔线
  const lines = truncated.split('\n');
  const outputLines = lines.map((line) => `  ${line}`);

  return `📟 Command: \`${command}\`\n${outputLines.join('\n')}`;
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
    "su - openclaw -c 'if ! command -v openclaw >/dev/null 2>&1; then sudo npm install -g openclaw@latest; fi'",
    "su - openclaw -c 'openclaw models set openrouter/minimax/minimax-m2.5 || true'",
    'su - openclaw -c \'pgrep -f "openclaw gateway run" >/dev/null || nohup openclaw gateway run --auth none --bind loopback --port 18789 > /home/openclaw/.openclaw/gateway.log 2>&1 &\'',
  ].join('; ');

  await dockerExec(containerName, script);
}

export async function ensureUserContainer(session: UserSession) {
  const containerName = safeName(session.containerName);

  console.log(
    `[MyClawGo] Ensuring container ${containerName} for user ${session.id}`
  );
  try {
    await execFileAsync('docker', ['start', containerName]);
    return { ok: true as const, mode: 'started-existing' as const };
  } catch {
    // continue and create
  }

  const envs = ['OPENROUTER_API_KEY']
    .map((k) => ({ key: k, value: process.env[k] }))
    .filter((e) => Boolean(e.value));

  const args = [
    'run',
    '-d',
    '--name',
    containerName,
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

  args.push(OPENCLAW_IMAGE, 'sh', '-c', 'sleep infinity');

  try {
    await execFileAsync('docker', args);
    await bootstrapOpenClaw(containerName);
    return { ok: true as const, mode: 'created' as const };
  } catch (error: unknown) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Unknown docker error',
    };
  }
}

export async function runOpenClawChatInContainer(
  session: UserSession,
  message: string
) {
  const containerName = safeName(session.containerName);

  await execFileAsync('docker', ['start', containerName]).catch(() => {});

  // Check if openclaw is installed yet (bootstrap may still be running for new containers)
  const checkCmd =
    "su - openclaw -c 'which openclaw 2>/dev/null && echo ready || echo not_ready'";
  const { stdout: checkOut } = await dockerExec(containerName, checkCmd).catch(
    () => ({ stdout: 'not_ready' })
  );
  if (!checkOut.includes('ready')) {
    return {
      ok: false as const,
      error:
        '🚀 Your workspace is still initializing (installing OpenClaw runtime). This takes about 1–2 minutes on first launch. Please wait a moment and try again.',
      isInitializing: true,
    };
  }

  const cmd = `su - openclaw -c ${JSON.stringify(
    `openclaw agent --local --agent main --message ${JSON.stringify(message)} --thinking off --json`
  )}`;

  try {
    const { stdout } = await dockerExec(containerName, cmd, 90_000);

    const parsed = extractJsonObjectFromStdout(stdout) as {
      payloads?: Array<{ text?: string }>;
      meta?: {
        agentMeta?: {
          model?: string;
          usage?: { input?: number; output?: number; total?: number };
          lastCallUsage?: { input?: number; output?: number; total?: number };
        };
      };
    } | null;

    const payloadText =
      parsed?.payloads
        ?.map((p) => p?.text || '')
        .filter(Boolean)
        .join('\n\n')
        .trim() || '';

    const reply =
      payloadText || stdout.trim() || 'OpenClaw returned empty output.';
    const model = parsed?.meta?.agentMeta?.model || DEFAULT_RUNTIME_MODEL;
    const usageSource =
      parsed?.meta?.agentMeta?.lastCallUsage || parsed?.meta?.agentMeta?.usage;

    return {
      ok: true as const,
      reply,
      model,
      usage: usageSource
        ? {
            inputTokens: Math.max(0, Number(usageSource.input || 0)),
            outputTokens: Math.max(0, Number(usageSource.output || 0)),
            totalTokens: Math.max(0, Number(usageSource.total || 0)),
          }
        : undefined,
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

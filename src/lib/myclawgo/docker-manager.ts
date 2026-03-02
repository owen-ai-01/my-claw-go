import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { UserSession } from './session-store';

const execFileAsync = promisify(execFile);

const OPENCLAW_IMAGE = process.env.MYCLAWGO_OPENCLAW_IMAGE || 'ubuntu:24.04';
const HOST_OPENCLAW_CONFIG =
  process.env.MYCLAWGO_SEED_CONFIG_PATH ||
  '/home/openclaw/.openclaw/openclaw.json';
const HOST_AUTH_PROFILES =
  process.env.MYCLAWGO_SEED_AUTH_PATH ||
  '/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json';
const HOST_PW_DIR =
  process.env.MYCLAWGO_PW_DIR || '/home/openclaw/docker-openclaw-pw';

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '');
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

  try {
    await execFileAsync('docker', ['start', containerName]);
    return { ok: true as const, mode: 'started-existing' as const };
  } catch {
    // continue and create
  }

  const envs = [
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
  ]
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

  const ensureGatewayCmd = `su - openclaw -c ${JSON.stringify(
    "pgrep -f 'openclaw gateway run' >/dev/null || (nohup openclaw gateway run --auth none --bind loopback --port 18789 > /home/openclaw/.openclaw/gateway.log 2>&1 &)"
  )}`;

  await dockerExec(containerName, ensureGatewayCmd).catch(() => {});

  const cmd = `su - openclaw -c ${JSON.stringify(
    `openclaw agent --agent main --message ${JSON.stringify(message)} --thinking off`
  )}`;

  try {
    const { stdout } = await dockerExec(containerName, cmd);
    const reply = stdout.trim() || 'OpenClaw returned empty output.';
    return { ok: true as const, reply };
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

const ALLOWED_COMMAND_PATTERNS: RegExp[] = [
  /^openclaw\s+skills\s+list$/,
  /^openclaw\s+skills\s+check(?:\s+[a-zA-Z0-9_.@\/-]+)?$/,
  /^openclaw\s+skills\s+info\s+[a-zA-Z0-9_.@\/-]+$/,
  /^openclaw\s+models\s+status$/,
  /^openclaw\s+models\s+list$/,
  /^openclaw\s+models\s+set\s+[a-zA-Z0-9_.:\/-]+$/,
  /^openclaw\s+agents\s+list(?:\s+--bindings)?$/,
  /^openclaw\s+agents\s+add\s+[a-zA-Z0-9_.-]+$/,
  /^openclaw\s+agent\s+--(?:message|agent|thinking|model|help)\b[\s\S]*$/,
  /^clawhub\s+install\s+[a-zA-Z0-9_.@\/-]+$/,
  /^clawhub\s+list$/,
  /^clawhub\s+search\s+[^\n]+$/,
];

const FORBIDDEN_SHELL_CHARS = /[;&|><`$\\]/;

function isAllowedCommand(command: string) {
  const c = command.trim();
  if (!c || c.length > 300) return false;
  if (/[\r\n]/.test(c)) return false;
  if (FORBIDDEN_SHELL_CHARS.test(c)) return false;
  return ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(c));
}

export async function runWhitelistedCommandInContainer(
  session: UserSession,
  command: string
) {
  const containerName = safeName(session.containerName);

  if (!isAllowedCommand(command)) {
    return {
      ok: false as const,
      error:
        'Command not allowed. Only safe OpenClaw/ClawHub commands without shell operators are supported.',
    };
  }

  await execFileAsync('docker', ['start', containerName]).catch(() => {});

  const wrapped = `su - openclaw -c ${JSON.stringify(command)}`;
  try {
    const { stdout, stderr } = await dockerExec(containerName, wrapped, 20_000);
    const merged = `${stdout || ''}${stderr || ''}`.trim() || '(no output)';
    const output =
      merged.length > 8_000
        ? `${merged.slice(0, 8_000)}\n\n...output truncated...`
        : merged;
    return { ok: true as const, output };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Container command failed';
    if (message.includes('timed out')) {
      return {
        ok: false as const,
        error: 'Command timed out after 20s. Please run a shorter command.',
      };
    }
    return {
      ok: false as const,
      error: message,
    };
  }
}

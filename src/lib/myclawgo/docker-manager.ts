import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UserSession } from './session-store';

const execFileAsync = promisify(execFile);

const OPENCLAW_IMAGE = process.env.MYCLAWGO_OPENCLAW_IMAGE || 'node:22-bookworm-slim';
const HOST_OPENCLAW_CONFIG =
  process.env.MYCLAWGO_SEED_CONFIG_PATH || '/home/openclaw/.openclaw/openclaw.json';
const HOST_AUTH_PROFILES =
  process.env.MYCLAWGO_SEED_AUTH_PATH || '/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json';

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function dockerExec(containerName: string, cmd: string) {
  const { stdout, stderr } = await execFileAsync('docker', [
    'exec',
    containerName,
    'sh',
    '-lc',
    cmd,
  ]);
  return { stdout, stderr };
}

async function bootstrapOpenClaw(containerName: string) {
  // Seed default config from host template, then start gateway daemon
  const script = [
    'set -e',
    'mkdir -p /home/openclaw/.openclaw',
    'if [ -f /seed/openclaw.json ] && [ ! -f /home/openclaw/.openclaw/openclaw.json ]; then cp /seed/openclaw.json /home/openclaw/.openclaw/openclaw.json; fi',
    'mkdir -p /home/openclaw/.openclaw/agents/main/agent',
    'if [ -f /seed/auth-profiles.json ] && [ ! -f /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json ]; then cp /seed/auth-profiles.json /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json; fi',
    'if ! command -v git >/dev/null 2>&1; then apt-get update && apt-get install -y git ca-certificates; fi',
    'if ! command -v openclaw >/dev/null 2>&1; then npm install -g openclaw@latest; fi',
    'openclaw gateway start || true',
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
    '/home/openclaw',
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

export async function runOpenClawChatInContainer(session: UserSession, message: string) {
  const containerName = safeName(session.containerName);

  // Ensure container is up
  await execFileAsync('docker', ['start', containerName]).catch(() => {});

  // Route message to containerized OpenClaw
  const cmd = `openclaw agent --agent main --message ${JSON.stringify(message)} --thinking low`;

  try {
    const { stdout } = await dockerExec(containerName, cmd);
    const reply = stdout.trim() || 'OpenClaw returned empty output.';
    return { ok: true as const, reply };
  } catch (error: unknown) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Failed to execute containerized OpenClaw',
    };
  }
}

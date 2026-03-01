import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UserSession } from './session-store';

const execFileAsync = promisify(execFile);

const OPENCLAW_IMAGE = process.env.MYCLAWGO_OPENCLAW_IMAGE || 'openclaw/openclaw:latest';

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

export async function ensureUserContainer(session: UserSession) {
  const containerName = safeName(session.containerName);

  // If already exists, just start it.
  try {
    await execFileAsync('docker', ['start', containerName]);
    return { ok: true as const, mode: 'started-existing' as const };
  } catch {
    // continue
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
    '-w',
    '/home/openclaw',
  ];

  for (const env of envs) {
    args.push('-e', `${env.key}=${env.value}`);
  }

  // keep container alive for now; actual OpenClaw bootstrapping happens after creation
  args.push(OPENCLAW_IMAGE, 'sh', '-c', 'sleep infinity');

  try {
    await execFileAsync('docker', args);
    return { ok: true as const, mode: 'created' as const };
  } catch (error: unknown) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Unknown docker error',
    };
  }
}

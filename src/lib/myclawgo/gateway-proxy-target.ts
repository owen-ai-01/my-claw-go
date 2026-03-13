import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSession } from '@/lib/myclawgo/session-store';

const execFileAsync = promisify(execFile);

async function dockerContainerExists(containerName: string) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps',
      '-a',
      '--format',
      '{{.Names}}',
    ]);
    return stdout.split('\n').map((line) => line.trim()).includes(containerName);
  } catch {
    return false;
  }
}

export async function resolveUserGatewayProxyTarget(userId: string) {
  const runtimeSession = await getSession(userId);
  if (!runtimeSession) {
    return {
      ok: false as const,
      error: 'Runtime session not found',
      code: 'runtime-session-missing',
    };
  }

  const containerExists = await dockerContainerExists(runtimeSession.containerName);
  if (!containerExists) {
    return {
      ok: false as const,
      error: 'Runtime container not found',
      code: 'runtime-container-missing',
      containerName: runtimeSession.containerName,
    };
  }

  return {
    ok: true as const,
    userId,
    containerName: runtimeSession.containerName,
    gateway: {
      host: '127.0.0.1',
      port: 18789,
      sessionKey: 'agent:main:main',
    },
  };
}

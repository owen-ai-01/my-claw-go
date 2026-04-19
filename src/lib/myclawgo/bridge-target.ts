import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSession } from './session-store';

const execFileAsync = promisify(execFile);
const BRIDGE_PORT = Number(process.env.MYCLAWGO_BRIDGE_PORT || 18080);

function getBridgeToken(): string {
  const token = process.env.MYCLAWGO_BRIDGE_TOKEN;
  if (!token)
    throw new Error(
      'MYCLAWGO_BRIDGE_TOKEN is not set. Bridge authentication is required.'
    );
  return token;
}

async function getContainerIp(containerName: string) {
  const { stdout } = await execFileAsync('docker', [
    'inspect',
    '-f',
    '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    containerName,
  ]);
  return stdout.trim();
}

export async function resolveUserBridgeTarget(userId: string) {
  const runtimeSession = await getSession(userId);
  if (!runtimeSession) {
    return {
      ok: false as const,
      code: 'runtime-session-missing',
      error: 'Runtime session not found',
    };
  }

  try {
    const ip = await getContainerIp(runtimeSession.containerName);
    if (!ip) {
      return {
        ok: false as const,
        code: 'runtime-bridge-ip-missing',
        error: 'Container bridge IP not found',
        containerName: runtimeSession.containerName,
      };
    }

    return {
      ok: true as const,
      userId,
      containerName: runtimeSession.containerName,
      bridge: {
        host: ip,
        port: BRIDGE_PORT,
        token: getBridgeToken(),
        baseUrl: `http://${ip}:${BRIDGE_PORT}`,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      code: 'runtime-bridge-unavailable',
      error: 'Container bridge target unavailable',
      details: error instanceof Error ? error.message : String(error),
      containerName: runtimeSession.containerName,
    };
  }
}

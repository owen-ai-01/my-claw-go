import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BridgeError } from './errors.js';

const execFileAsync = promisify(execFile);
const OPENCLAW_NODE_OPTIONS = process.env.MYCLAWGO_OPENCLAW_NODE_OPTIONS || '--max-old-space-size=1536';

export async function runCommand(command: string, args: string[], timeoutMs = 10000) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      cwd: process.env.MYCLAWGO_OPENCLAW_CWD || '/home/openclaw',
      env: {
        ...process.env,
        HOME: '/home/openclaw',
        USER: 'openclaw',
        LOGNAME: 'openclaw',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, OPENCLAW_NODE_OPTIONS].filter(Boolean).join(' ').trim(),
      },
    });

    return {
      stdout: result.stdout?.toString() ?? '',
      stderr: result.stderr?.toString() ?? '',
    };
  } catch (error: any) {
    if (error?.code === 'ETIMEDOUT' || error?.killed === true || error?.signal === 'SIGTERM') {
      throw new BridgeError(
        'COMMAND_TIMEOUT',
        `Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`,
        504,
        error
      );
    }

    const stderr = error?.stderr?.toString?.() || '';
    const stdout = error?.stdout?.toString?.() || '';
    const oom = /heap out of memory|allocation failed/i.test(`${stderr}\n${stdout}`);

    throw new BridgeError(
      oom ? 'COMMAND_OOM' : 'COMMAND_FAILED',
      oom
        ? `Command ran out of memory: ${command} ${args.join(' ')}`
        : `Command failed: ${command} ${args.join(' ')}`,
      oom ? 500 : 500,
      error
    );
  }
}

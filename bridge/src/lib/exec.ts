import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BridgeError } from './errors.js';

const execFileAsync = promisify(execFile);

export async function runCommand(command: string, args: string[], timeoutMs = 10000) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });

    return {
      stdout: result.stdout?.toString() ?? '',
      stderr: result.stderr?.toString() ?? '',
    };
  } catch (error) {
    throw new BridgeError(
      'COMMAND_FAILED',
      `Command failed: ${command} ${args.join(' ')}`,
      500,
      error
    );
  }
}

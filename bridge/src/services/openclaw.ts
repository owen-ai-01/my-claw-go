import { BridgeError } from '../lib/errors.js';
import { runCommand } from '../lib/exec.js';

function extractReply(parsed: any) {
  if (typeof parsed?.reply === 'string' && parsed.reply.trim()) return parsed.reply;
  const payloads = parsed?.result?.payloads;
  if (Array.isArray(payloads)) {
    return payloads.map((item: any) => item?.text || '').filter(Boolean).join('\n\n').trim();
  }
  if (typeof parsed?.raw === 'string') return parsed.raw;
  return '';
}

export async function checkOpenClawHealth() {
  const { stdout } = await runCommand('openclaw', ['gateway', 'call', 'health', '--json'], 5000);
  try {
    return JSON.parse(stdout);
  } catch {
    throw new BridgeError('OPENCLAW_NOT_READY', 'OpenClaw health check failed', 503);
  }
}

export async function sendChatMessage(params: { message: string; agentId: string; timeoutMs?: number }) {
  const { message, agentId, timeoutMs = 90000 } = params;
  const { stdout } = await runCommand(
    'openclaw',
    ['agent', '--agent', agentId, '--message', message, '--thinking', 'off', '--json'],
    timeoutMs
  );

  try {
    const parsed = JSON.parse(stdout);
    return {
      raw: parsed,
      reply: extractReply(parsed),
      model: parsed?.result?.meta?.agentMeta?.model,
      usage: parsed?.result?.meta?.agentMeta?.lastCallUsage || parsed?.result?.meta?.agentMeta?.usage,
    };
  } catch {
    return { raw: stdout.trim(), reply: stdout.trim() };
  }
}

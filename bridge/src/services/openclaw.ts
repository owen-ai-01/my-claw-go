import { appendChatTranscript } from './chat-store.js';
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
  // Bridge already runs as openclaw user — no need for `su`
  const { stdout } = await runCommand('bash', ['-c', 'cd /home/openclaw && openclaw gateway call health --json'], 5000);
  try {
    return JSON.parse(stdout);
  } catch {
    throw new BridgeError('OPENCLAW_NOT_READY', 'OpenClaw health check failed', 503);
  }
}

export async function sendChatMessage(params: {
  message: string;
  agentId: string;
  timeoutMs?: number;
  channel?: string;
  chatScope?: string;
}) {
  const { message, agentId, timeoutMs = 90000, channel = 'direct', chatScope = 'default' } = params;
  const escapedMessage = message.replace(/'/g, `'"'"'`);
  // Bridge runs as openclaw user — run openclaw CLI directly without `su`
  const command = `cd /home/openclaw && HOME=/home/openclaw USER=openclaw LOGNAME=openclaw openclaw agent --local --agent '${agentId}' --message '${escapedMessage}' --thinking off --json`;
  const { stdout } = await runCommand(
    'bash',
    ['-c', command],
    timeoutMs
  );

  try {
    const parsed = JSON.parse(stdout);
    const reply = extractReply(parsed);
    const fallbackReply = reply || parsed?.error || parsed?.result?.error || '';
    await appendChatTranscript({ role: 'user', text: message, agentId, channel, chatScope });
    await appendChatTranscript({ role: 'assistant', text: fallbackReply || '', agentId, channel, chatScope, meta: { model: parsed?.result?.meta?.agentMeta?.model } });
    return {
      raw: parsed,
      reply: fallbackReply,
      model: parsed?.result?.meta?.agentMeta?.model,
      usage: parsed?.result?.meta?.agentMeta?.lastCallUsage || parsed?.result?.meta?.agentMeta?.usage,
    };
  } catch {
    await appendChatTranscript({ role: 'user', text: message, agentId, channel, chatScope });
    await appendChatTranscript({ role: 'assistant', text: stdout.trim(), agentId, channel, chatScope });
    return { raw: stdout.trim(), reply: stdout.trim() };
  }
}

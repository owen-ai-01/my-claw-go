import fs from 'node:fs/promises';
import path from 'node:path';
import { OPENCLAW_HOME } from '../lib/paths.js';

export type ChatStoreKey = {
  channel?: string;
  agentId: string;
  chatScope?: string;
};

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getChatFilePath(input: ChatStoreKey) {
  const channel = sanitize(input.channel || 'direct');
  const agentId = sanitize(input.agentId || 'main');
  const chatScope = sanitize(input.chatScope || 'default');
  return path.join(OPENCLAW_HOME, 'chats', channel, agentId, `${chatScope}.md`);
}

export async function appendChatTranscript(
  input: ChatStoreKey & { role: 'user' | 'assistant'; text: string; meta?: Record<string, unknown> }
) {
  const filePath = getChatFilePath(input);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const timestamp = new Date().toISOString();
  const metaLine = input.meta ? `meta: ${JSON.stringify(input.meta)}\n` : '';
  const block = [
    '---',
    '',
    `## ${input.role}`,
    `timestamp: ${timestamp}`,
    metaLine.trimEnd(),
    '',
    input.text.trim(),
    '',
  ]
    .filter(Boolean)
    .join('\n');
  await fs.appendFile(filePath, `${block}\n`, 'utf8');
  return filePath;
}

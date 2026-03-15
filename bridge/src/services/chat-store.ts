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

export async function readChatTranscript(input: ChatStoreKey) {
  const filePath = getChatFilePath(input);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parts = raw.split('\n---\n').map((x) => x.trim()).filter(Boolean);
    const messages = parts
      .map((part, index) => {
        const lines = part.split('\n');
        const roleLine = lines.find((line) => line.startsWith('## '));
        const timestampLine = lines.find((line) => line.startsWith('timestamp: '));
        const metaIndex = lines.findIndex((line) => line.startsWith('meta: '));
        const contentStart = metaIndex >= 0 ? metaIndex + 2 : 3;
        const role = roleLine?.replace('## ', '').trim();
        const createdAt = timestampLine?.replace('timestamp: ', '').trim();
        const content = lines.slice(contentStart).join('\n').trim();
        if ((role !== 'user' && role !== 'assistant') || !content) return null;
        return {
          id: `${input.agentId}-${index}`,
          role,
          content,
          createdAt,
        };
      })
      .filter(Boolean);
    return messages;
  } catch {
    return [];
  }
}

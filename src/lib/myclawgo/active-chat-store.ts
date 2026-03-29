import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_DIR =
  process.env.MYCLAWGO_DATA_DIR ||
  '/home/openclaw/project/my-claw-go/.runtime-data';
const ACTIVE_CHAT_FILE = path.join(BASE_DIR, 'active-chat.json');

type ActiveChatMap = Record<string, { agentId: string; updatedAt: string }>;

async function ensureBase() {
  await fs.mkdir(BASE_DIR, { recursive: true });
}

async function readAll(): Promise<ActiveChatMap> {
  await ensureBase();
  try {
    const raw = await fs.readFile(ACTIVE_CHAT_FILE, 'utf8');
    return JSON.parse(raw) as ActiveChatMap;
  } catch {
    return {};
  }
}

async function writeAll(data: ActiveChatMap) {
  await ensureBase();
  await fs.writeFile(ACTIVE_CHAT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function setActiveChatAgent(userId: string, agentId: string) {
  const map = await readAll();
  map[userId] = { agentId, updatedAt: new Date().toISOString() };
  await writeAll(map);
}

export async function getActiveChatAgent(userId: string) {
  const map = await readAll();
  return map[userId]?.agentId || '';
}

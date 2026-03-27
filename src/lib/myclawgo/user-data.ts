import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AVAILABLE_MODELS } from './model-catalog';

const BASE_DIR =
  process.env.MYCLAWGO_DATA_DIR ||
  '/home/openclaw/project/my-claw-go/.runtime-data';

const PAGE_SIZE = 10;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  timestamp: string;
  tokens?: { input: number; output: number; total: number };
};

export type UserPrefs = {
  model: string;
};

const DEFAULT_MODEL = 'openrouter/openai/gpt-4o-mini';

export { AVAILABLE_MODELS };

function userDir(userId: string) {
  return path.join(BASE_DIR, 'users', userId);
}
function chatDir(userId: string) {
  return path.join(BASE_DIR, 'chats', userId);
}
function historyFile(userId: string) {
  return path.join(chatDir(userId), 'chat-history.json');
}
function prefsFile(userId: string) {
  return path.join(chatDir(userId), 'user-prefs.json');
}
async function ensureUserDir(userId: string) {
  await fs.mkdir(chatDir(userId), { recursive: true });
}

// ── Chat History ─────────────────────────────────────────────────────────────

export async function readChatHistory(userId: string): Promise<ChatMessage[]> {
  try {
    const raw = await fs.readFile(historyFile(userId), 'utf-8');
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function getChatHistoryPage(
  userId: string,
  page: number
): Promise<{ messages: ChatMessage[]; total: number; hasMore: boolean }> {
  const all = await readChatHistory(userId);
  const total = all.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = Math.max(0, total - safePage * PAGE_SIZE);
  const end = total - (safePage - 1) * PAGE_SIZE;
  return { messages: all.slice(start, end), total, hasMore: start > 0 };
}

export async function appendMessage(
  userId: string,
  msg: Omit<ChatMessage, 'id' | 'timestamp'>
): Promise<ChatMessage> {
  await ensureUserDir(userId);
  const all = await readChatHistory(userId);
  const newMsg: ChatMessage = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  all.push(newMsg);
  await fs.writeFile(historyFile(userId), JSON.stringify(all, null, 2));
  return newMsg;
}

export async function deleteMessage(
  userId: string,
  messageId: string
): Promise<boolean> {
  const all = await readChatHistory(userId);
  const filtered = all.filter((m) => m.id !== messageId);
  if (filtered.length === all.length) return false;
  await fs.writeFile(historyFile(userId), JSON.stringify(filtered, null, 2));
  return true;
}

export async function clearChatHistory(userId: string): Promise<void> {
  await ensureUserDir(userId);
  await fs.writeFile(historyFile(userId), '[]');
}

// ── User Prefs ────────────────────────────────────────────────────────────────

export async function readUserPrefs(userId: string): Promise<UserPrefs> {
  try {
    const raw = await fs.readFile(prefsFile(userId), 'utf-8');
    return JSON.parse(raw) as UserPrefs;
  } catch {
    return { model: DEFAULT_MODEL };
  }
}

export async function saveUserPrefs(
  userId: string,
  prefs: Partial<UserPrefs>
): Promise<UserPrefs> {
  await ensureUserDir(userId);
  const current = await readUserPrefs(userId);
  const updated = { ...current, ...prefs };
  await fs.writeFile(prefsFile(userId), JSON.stringify(updated, null, 2));
  return updated;
}

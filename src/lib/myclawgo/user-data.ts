import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

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

export const AVAILABLE_MODELS: { id: string; label: string }[] = [
  // OpenAI
  { id: 'openrouter/openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
  { id: 'openrouter/openai/gpt-5-mini', label: 'OpenAI · GPT-5 Mini' },
  { id: 'openrouter/openai/gpt-5.1', label: 'OpenAI · GPT-5.1' },
  { id: 'openrouter/openai/gpt-5.2', label: 'OpenAI · GPT-5.2' },
  { id: 'openrouter/openai/gpt-5.3-codex', label: 'OpenAI · GPT-5.3 Codex' },
  { id: 'openrouter/openai/gpt-5.4', label: 'OpenAI · GPT-5.4' },

  // Anthropic
  { id: 'openrouter/anthropic/claude-haiku-4.5', label: 'Anthropic · Claude Haiku 4.5' },
  { id: 'openrouter/anthropic/claude-sonnet-4.5', label: 'Anthropic · Claude Sonnet 4.5' },
  { id: 'openrouter/anthropic/claude-sonnet-4.6', label: 'Anthropic · Claude Sonnet 4.6' },
  { id: 'openrouter/anthropic/claude-opus-4.6', label: 'Anthropic · Claude Opus 4.6' },

  // Google
  { id: 'openrouter/google/gemini-2.0-flash-exp', label: 'Google · Gemini 2.0 Flash Exp' },
  { id: 'openrouter/google/gemini-2.0-flash-001', label: 'Google · Gemini 2.0 Flash 001' },
  { id: 'openrouter/google/gemini-2.5-flash-lite', label: 'Google · Gemini 2.5 Flash Lite' },
  { id: 'openrouter/google/gemini-2.5-pro', label: 'Google · Gemini 2.5 Pro' },
  { id: 'openrouter/google/gemini-3-pro-preview', label: 'Google · Gemini 3 Pro Preview' },

  // DeepSeek
  { id: 'openrouter/deepseek/deepseek-v3', label: 'DeepSeek · V3' },
  { id: 'openrouter/deepseek/deepseek-v3.1', label: 'DeepSeek · V3.1' },
  { id: 'openrouter/deepseek/deepseek-v3.2', label: 'DeepSeek · V3.2' },
  { id: 'openrouter/deepseek/deepseek-r1', label: 'DeepSeek · R1' },

  // Z.ai / GLM
  { id: 'openrouter/z-ai/glm-4.6', label: 'Z.ai · GLM 4.6' },
  { id: 'openrouter/z-ai/glm-4.6v', label: 'Z.ai · GLM 4.6v' },
  { id: 'openrouter/z-ai/glm-4.7', label: 'Z.ai · GLM 4.7' },
  { id: 'openrouter/z-ai/glm-4.7-flash', label: 'Z.ai · GLM 4.7 Flash' },
  { id: 'openrouter/z-ai/glm-5', label: 'Z.ai · GLM 5' },

  // MiniMax
  { id: 'openrouter/minimax/minimax-m2.5', label: 'MiniMax · M2.5' },

  // Moonshot / Kimi
  { id: 'openrouter/moonshotai/kimi-k2', label: 'Moonshot · Kimi K2' },
  { id: 'openrouter/moonshotai/kimi-k2-thinking', label: 'Moonshot · Kimi K2 Thinking' },
  { id: 'openrouter/moonshotai/kimi-k2.5', label: 'Moonshot · Kimi K2.5' },
];

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

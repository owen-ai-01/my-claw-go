/**
 * Direct chat via OpenRouter HTTP API.
 *
 * Bypasses the OpenClaw bridge (no WebSocket, no agent memory/tools).
 * Used for L1/L2 messages where agent tools are not needed.
 *
 * Benefits:
 *  - ~200ms faster (no bridge WS roundtrip)
 *  - Uses cheap models (Flash, Haiku, DeepSeek)
 *  - Still billed correctly via our credits system
 */

import type { DirectChatUsage } from './user-chat';

type OpenRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type OpenRouterResponse = {
  id?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  error?: { message?: string; code?: number };
};

export type DirectChatResult = {
  reply: string;
  model: string;
  usage: DirectChatUsage;
  raw?: unknown;
  durationMs: number;
};

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
  return key;
}

function buildSystemPrompt(): string {
  return (
    process.env.MYCLAWGO_DIRECT_SYSTEM_PROMPT ||
    'You are a helpful AI assistant. Be concise and helpful.'
  );
}

/**
 * Send a single-turn message to OpenRouter directly.
 * No memory/history, no tools — just fast and cheap.
 */
export async function sendDirectChat(params: {
  message: string;
  model: string;
  recentHistory?: OpenRouterMessage[]; // optional few-shot context (last N turns)
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<DirectChatResult> {
  const { message, model, recentHistory = [], timeoutMs = 30000 } = params;
  const startedAt = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...recentHistory.slice(-6), // at most 6 turns of context
    { role: 'user', content: message },
  ];

  const key = getOpenRouterKey();
  const body = {
    model,
    messages,
    max_tokens: 2048,
    temperature: 0.7,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'http-referer': process.env.NEXT_PUBLIC_APP_URL || 'https://myclawgo.com',
      'x-title': 'MyClawGo',
    },
    body: JSON.stringify(body),
    signal: params.signal || AbortSignal.timeout(timeoutMs),
  });

  const data = (await res.json().catch(() => ({}))) as OpenRouterResponse;

  if (!res.ok || data.error) {
    const msg = data.error?.message || `OpenRouter API error: HTTP ${res.status}`;
    throw new Error(msg);
  }

  const reply = data.choices?.[0]?.message?.content?.trim() || '';
  if (!reply) throw new Error('OpenRouter returned empty reply');

  const usage: DirectChatUsage = {
    input: data.usage?.prompt_tokens,
    output: data.usage?.completion_tokens,
    total: data.usage?.total_tokens,
  };

  return {
    reply,
    model: data.model || model,
    usage,
    raw: data,
    durationMs: Date.now() - startedAt,
  };
}

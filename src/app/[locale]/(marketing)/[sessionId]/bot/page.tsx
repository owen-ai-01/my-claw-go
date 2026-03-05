'use client';

import {
  getClientTimeoutMs,
  isSafeCommandInput,
} from '@/lib/myclawgo/command-policy';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  timestamp: string;
};

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function normalizeError(raw: string): string {
  if (raw.includes('credits') || raw.includes('Credits')) return raw;
  if (raw.includes('timeout') || raw.includes('timed out')) return raw;
  if (raw.includes('initializing')) return raw;
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

export default function BotPage() {
  const params = useParams<{ sessionId: string; locale?: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();

  const [guardReady, setGuardReady] = useState(false);
  const [lowCredits, setLowCredits] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Guard check
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await fetch(`/api/runtime/${sessionId}/guard`);
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (data?.action === 'redirect-login') {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'redirect-own-bot') {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'redirect-pricing') {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'allow-with-low-credits') setLowCredits(true);
      } finally {
        if (mounted) setGuardReady(true);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [router, sessionId]);

  // Load initial history
  const loadHistory = useCallback(
    async (p: number, prepend = false) => {
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/runtime/${sessionId}/messages?page=${p}`);
        const data = await res.json();
        if (data.ok) {
          setMessages((prev) =>
            prepend ? [...data.messages, ...prev] : data.messages
          );
          setHasMore(data.hasMore);
        }
      } finally {
        setLoadingHistory(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (guardReady) loadHistory(1);
  }, [guardReady, loadHistory]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load more (older messages)
  async function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    await loadHistory(nextPage, true);
  }

  // Delete single message
  async function onDeleteMessage(msgId: string) {
    await fetch(`/api/runtime/${sessionId}/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msgId }),
    });
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }

  // Clear all
  async function onClearAll() {
    if (!confirm('Clear all chat history?')) return;
    await fetch(`/api/runtime/${sessionId}/messages`, { method: 'DELETE' });
    setMessages([]);
    setPage(1);
    setHasMore(false);
  }

  // Send message
  async function onSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    let timeoutMs = 25_000;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    try {
      const explicitCmd = /^\/cmd(?:\s|$)/i.test(text);
      const rawCommand = explicitCmd
        ? text.replace(/^\/cmd\s*/i, '').trim()
        : text;
      const isCommand = explicitCmd || isSafeCommandInput(text);

      timeoutMs = getClientTimeoutMs(isCommand, rawCommand);
      timeout = setTimeout(() => controller.abort(), timeoutMs);

      const payload = isCommand
        ? { message: rawCommand, isCommand: true }
        : { message: text };

      const res = await fetch(
        isCommand
          ? `/api/runtime/${sessionId}/exec`
          : `/api/runtime/${sessionId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      const rawBody = await res.text();
      let data: Record<string, unknown> = {};
      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          data = { error: rawBody.slice(0, 500) };
        }
      }

      if (!res.ok || !data?.ok) {
        if (data?.code === 'INSUFFICIENT_CREDITS' || res.status === 402)
          setLowCredits(true);
        const rawError = String(
          data?.error || `Request failed (HTTP ${res.status})`
        );
        const botMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `⚠️ ${normalizeError(rawError)}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((m) => [...m, botMsg]);
        return;
      }

      const replyText = isCommand
        ? `🛠️ [${String(data?.container || 'container')}]\n${String(data?.output || '(no output)')}`
        : String(data?.reply || 'No reply');

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: replyText,
        model: data?.model as string | undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, botMsg]);
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: aborted
          ? timeoutMs >= 60_000
            ? `⚠️ Request timed out after ${Math.floor(timeoutMs / 1000)}s. This command may need longer; please retry once.`
            : `⚠️ Request timed out after ${Math.floor(timeoutMs / 1000)}s. Please retry once.`
          : '⚠️ Network request failed. Please retry.',
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, botMsg]);
    } finally {
      if (timeout) clearTimeout(timeout);
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  if (!guardReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Checking workspace access…
      </main>
    );
  }

  return (
    <main className="flex flex-col h-screen bg-slate-950 text-white">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">MyClawGo</span>
          <span className="text-xs text-slate-500">Workspace</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-red-400 transition px-2 py-1 rounded"
          >
            Clear
          </button>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mb-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingHistory}
              className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-full px-4 py-1.5 transition"
            >
              {loadingHistory ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && !loadingHistory && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-20">
            <div className="text-4xl mb-3">🦞</div>
            <p className="text-sm font-medium text-slate-400">
              Your OpenClaw workspace is ready.
            </p>
            <p className="text-xs mt-1">
              Send a message to get started. Using{' '}
              <p className="text-xs mt-1">Send a message to get started.</p>
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`relative max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}
            >
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[10px] text-slate-600">
                  {formatTime(msg.timestamp)}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteMessage(msg.id)}
                  className="text-[10px] text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {lowCredits && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
            Credits are running low.{' '}
            <a
              href="/settings/credits"
              className="underline hover:text-amber-100"
            >
              Top up credits
            </a>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="border-t border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              lowCredits
                ? 'Insufficient credits…'
                : 'Message your workspace… (Shift+Enter for newline)'
            }
            disabled={loading || lowCredits}
            className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 max-h-40 overflow-y-auto"
            style={{ minHeight: '48px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={loading || !input.trim() || lowCredits}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <svg
              className="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-600 text-center mt-2">
          Press Enter to send
        </p>
      </div>
    </main>
  );
}

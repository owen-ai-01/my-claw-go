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

function phaseMeta(phase: string) {
  switch (phase) {
    case 'container-missing':
    case 'preparing':
      return {
        title: 'Creating your workspace…',
        subtitle: 'We are preparing your private OpenClaw runtime.',
      };
    case 'runtime-installing':
      return {
        title: 'Installing runtime…',
        subtitle: 'OpenClaw tools are being prepared inside your container.',
      };
    case 'gateway-starting':
      return {
        title: 'Starting the gateway…',
        subtitle:
          'Your workspace is almost ready. Final service checks are running.',
      };
    default:
      return {
        title: 'Preparing your workspace…',
        subtitle:
          'Please keep this page open — we will enter chat automatically once ready.',
      };
  }
}

export default function BotPage() {
  const params = useParams<{ sessionId: string; locale?: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();

  const [guardReady, setGuardReady] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeStatusText, setRuntimeStatusText] = useState(
    'Preparing your workspace…'
  );
  const [runtimePhase, setRuntimePhase] = useState('preparing');
  const [lowCredits, setLowCredits] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadingMoreRef = useRef(false);
  const isPrependRef = useRef(false);
  const prevScrollHeightRef = useRef(0);

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

  // Wait until user runtime is ready before showing the chat UI
  useEffect(() => {
    if (!guardReady) return;
    let stopped = false;

    const waitRuntimeReady = async () => {
      // Keep polling until runtime is ready. First launches can exceed 2 minutes
      // depending on package installation and network conditions.
      while (!stopped) {
        const res = await fetch(`/api/runtime/${sessionId}/ready`).catch(
          () => null
        );
        const data = await res?.json().catch(() => ({}));

        if (stopped) return;
        if (data?.ready) {
          setRuntimeReady(true);
          return;
        }

        setRuntimePhase(String(data?.phase || 'preparing'));
        setRuntimeStatusText(
          String(
            data?.message ||
              'Creating your workspace. Please keep this page open — we will enter chat automatically once ready.'
          )
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    };

    waitRuntimeReady();
    return () => {
      stopped = true;
    };
  }, [guardReady, sessionId]);

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
    if (guardReady && runtimeReady) loadHistory(1);
  }, [guardReady, runtimeReady, loadHistory]);

  // Mobile: re-fetch latest messages when page becomes visible again (browser tab restore)
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        guardReady &&
        runtimeReady
      ) {
        loadHistory(1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [guardReady, runtimeReady, loadHistory]);

  // Scroll to bottom only for new messages; preserve position when prepending
  useEffect(() => {
    if (isPrependRef.current) {
      // Restore scroll position after prepend so user stays where they were
      const newScrollHeight = document.documentElement.scrollHeight;
      const added = newScrollHeight - prevScrollHeightRef.current;
      window.scrollBy({ top: added, behavior: 'instant' });
      isPrependRef.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-load more when user scrolls to the top sentinel
  useEffect(() => {
    if (!topSentinelRef.current) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !loadingHistory &&
          !isLoadingMoreRef.current
        ) {
          isLoadingMoreRef.current = true;
          isPrependRef.current = true;
          prevScrollHeightRef.current = document.documentElement.scrollHeight;
          const nextPage = page + 1;
          setPage(nextPage);
          await loadHistory(nextPage, true);
          isLoadingMoreRef.current = false;
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingHistory, page, loadHistory]);

  // Load more (older messages)
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
    const isFirstMessage = messages.length === 0;

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

    try {
      const explicitCmd = /^\/cmd(?:\s|$)/i.test(text);
      const rawCommand = explicitCmd
        ? text.replace(/^\/cmd\s*/i, '').trim()
        : text;
      const isCommand = explicitCmd || isSafeCommandInput(text);

      if (isCommand) {
        timeoutMs = getClientTimeoutMs(isCommand, rawCommand);
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(`/api/runtime/${sessionId}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: rawCommand, isCommand: true }),
          signal: controller.signal,
        });

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

        const replyText = `🛠️ [${String(data?.container || 'container')}]
${String(data?.output || '(no output)')}`;

        const botMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: replyText,
          model: data?.model as string | undefined,
          timestamp: new Date().toISOString(),
        };
        setMessages((m) => [...m, botMsg]);
        return;
      }

      if (isFirstMessage) {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 90_000);
        const firstRes = await fetch(`/api/runtime/${sessionId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });
        const firstData = (await firstRes.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!firstRes.ok || !firstData?.ok) {
          const rawError = String(
            firstData?.error || `Request failed (HTTP ${firstRes.status})`
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

        const botMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: String(firstData.reply || 'No reply'),
          timestamp: new Date().toISOString(),
        };
        setMessages((m) => [...m, botMsg]);
        return;
      }

      const createRes = await fetch(`/api/runtime/${sessionId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: isCommand ? rawCommand : text,
          isCommand,
        }),
      });

      const createData = (await createRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!createRes.ok || !createData?.ok || !createData?.taskId) {
        const rawError = String(
          createData?.error || `Request failed (HTTP ${createRes.status})`
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

      const taskId = String(createData.taskId);
      const startMs = Date.now();

      while (Date.now() - startMs < 10 * 60 * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const statusRes = await fetch(
          `/api/runtime/${sessionId}/tasks/${taskId}`
        );
        const statusData = (await statusRes.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;

        if (!statusRes.ok || !statusData?.ok) {
          const rawError = String(
            statusData?.error || `Task status failed (HTTP ${statusRes.status})`
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

        const status = String(statusData.status || 'queued');
        if (status === 'done') {
          const botMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: String(statusData.reply || 'No reply'),
            timestamp: new Date().toISOString(),
          };
          setMessages((m) => [...m, botMsg]);
          return;
        }

        if (status === 'failed') {
          const botMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: `⚠️ ${normalizeError(String(statusData.error || 'Task failed'))}`,
            timestamp: new Date().toISOString(),
          };
          setMessages((m) => [...m, botMsg]);
          return;
        }
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '⚠️ Task is still running. Please wait a bit and retry.',
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, botMsg]);
    } catch (error) {
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '⚠️ Network request failed. Please retry.',
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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white">
            Checking workspace access…
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Verifying your session and access permissions.
          </p>
        </div>
      </main>
    );
  }

  if (!runtimeReady) {
    const meta = phaseMeta(runtimePhase);
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400" />
            </div>
          </div>
          <p className="text-base font-semibold text-white">{meta.title}</p>
          <p className="mt-2 text-sm text-slate-400">{meta.subtitle}</p>
          <div className="mt-5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-2 w-2/3 animate-pulse rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500" />
          </div>
          <p className="mt-4 text-xs text-slate-500">{runtimeStatusText}</p>
        </div>
      </main>
    );
  }

  return (
    /*
     * Telegram-style layout:
     * - html/body must be 100dvh with no outer scroll
     * - header: fixed at top
     * - messages: flex-1, overflow-y-auto, only this area scrolls
     * - input: sticks to bottom, auto-grows, no inner scrollbar
     */
    <div className="flex flex-col min-h-screen bg-slate-950 text-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">MyClawGo</span>
          <span className="text-xs text-slate-500">Workspace</span>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-slate-500 hover:text-red-400 transition px-2 py-1 rounded"
        >
          Clear
        </button>
      </header>

      {/* ── Messages ── Telegram-style: only this scrolls */}
      <div className="flex-1 px-4 py-4 space-y-2 max-w-3xl mx-auto w-full">
        {/* Top sentinel — triggers auto-load when scrolled into view */}
        <div ref={topSentinelRef} className="h-1" />
        {loadingHistory && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-slate-500">Loading…</span>
          </div>
        )}

        {messages.length === 0 && !loadingHistory && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="text-4xl mb-3">🦞</div>
            <p className="text-sm font-medium text-slate-400">
              Your OpenClaw workspace is ready.
            </p>
            <p className="text-xs mt-1 text-slate-500">
              Send a message to get started.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`flex flex-col w-full max-w-[70%] sm:max-w-[58%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 w-full ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-2xl rounded-br-[4px]'
                    : 'bg-slate-800 text-slate-100 rounded-2xl rounded-bl-[4px]'
                }`}
              >
                {msg.text}
              </div>
              <div className="flex items-center gap-2 mt-0.5 px-1">
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
            <div className="bg-slate-800 rounded-2xl rounded-bl-[4px] px-4 py-3">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {lowCredits && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center mt-2">
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

      {/* ── Input bar ── Telegram-style: fixed at bottom, grows with content */}
      <div className="sticky bottom-0 border-t border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-end gap-2 max-w-3xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={lowCredits ? 'Insufficient credits…' : 'Message…'}
            disabled={loading || lowCredits}
            className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 overflow-y-auto"
            style={{ minHeight: '40px', maxHeight: '160px' }}
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
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition mb-0.5"
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
      </div>
    </div>
  );
}

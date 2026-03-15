'use client';

import { useEffect, useRef, useState } from 'react';

type RuntimeStatus =
  | { ok: true; state: 'not_created'; reason: string; containerName?: string }
  | { ok: true; state: 'ready'; reason: string; containerName?: string }
  | { ok: false; error: string };

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
};

function ChatLayout() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/chat/history?agentId=main');
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { messages?: ChatMessage[] };
        };
        if (data.ok && data.data?.messages) {
          setMessages(data.data.messages);
        }
      } catch {
        // silently ignore history load failure
      } finally {
        setHistoryLoading(false);
      }
    };
    load();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, agentId: 'main', timeoutMs: 90000 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { reply?: string };
        error?: string | { message?: string };
      };

      if (!res.ok || data.ok !== true) {
        const errMsg =
          typeof data.error === 'string'
            ? data.error
            : (data.error as { message?: string })?.message || 'Failed to send message';
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: `⚠️ ${errMsg}`, createdAt: new Date().toISOString() },
        ]);
        return;
      }

      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.data?.reply || '⚠️ Empty reply',
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `⚠️ ${msg}`, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Messages area */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6 sm:px-6">
        {historyLoading ? (
          <div className="m-auto text-sm text-muted-foreground">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="m-auto max-w-sm text-center">
            <p className="text-2xl mb-2">👋</p>
            <p className="text-sm text-muted-foreground">
              Start a conversation with your AI assistant.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || `${msg.role}-${idx}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  AI
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              AI
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3 sm:px-6">
        <div className="flex items-end gap-2 rounded-2xl border bg-background px-4 py-2.5">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Message your assistant… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none max-h-[120px] leading-relaxed py-0.5"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !input.trim()}
            className="flex-shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground/50">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export function ChatShell() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      const res = await fetch('/api/chat/runtime-status').catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as RuntimeStatus;
      if (stopped) return;
      if (!data || typeof data !== 'object') {
        setStatus({ ok: false, error: 'Failed to load runtime status' });
        return;
      }
      setStatus(data);
    };
    run();
    return () => {
      stopped = true;
    };
  }, []);

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/chat/create', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as
        | (RuntimeStatus & { containerName?: string })
        | { ok?: boolean; error?: string; containerName?: string };
      if (!res.ok || !data || data.ok !== true) {
        const error = 'error' in (data || {}) ? (data as { error?: string }).error : undefined;
        setStatus({ ok: false, error: error || 'Failed to create runtime' });
        return;
      }
      setStatus({ ok: true, state: 'ready', reason: 'runtime-created', containerName: data.containerName });
    } finally {
      setCreating(false);
    }
  }

  if (!status) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader />
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking your runtime status…</p>
        </div>
      </div>
    );
  }

  if (status.ok && status.state === 'not_created') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader />
        <div className="rounded-2xl border bg-card p-10 shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <div className="mb-4 text-4xl">🚀</div>
            <h2 className="text-xl font-semibold">Set up your workspace</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your private AI workspace to start chatting.
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status && !status.ok) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader />
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {status.error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader />
      <ChatLayout />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your personal AI assistant.</p>
    </div>
  );
}

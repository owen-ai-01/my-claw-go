'use client';

import { useEffect, useMemo, useState } from 'react';

type RuntimeStatus =
  | { ok: true; state: 'not_created'; reason: string; containerName?: string }
  | { ok: true; state: 'ready'; reason: string; containerName?: string }
  | { ok: false; error: string };

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
};

function ReadyChatLayout({ containerName }: { containerName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      const res = await fetch('/api/chat/history').catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: ChatMessage[];
      };
      if (stopped) return;
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    };
    run();
    return () => {
      stopped = true;
    };
  }, []);

  const placeholder = useMemo(() => 'Send a message to your MyClawGo…', []);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;
    const optimisticUser: ChatMessage = { role: 'user', text };
    setMessages((m) => [...m, optimisticUser]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: `⚠️ ${data?.error || 'Failed to send message'}`,
          },
        ]);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', text: String(data.reply || '') }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid min-h-[72vh] grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">MyClawGo Chat</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Direct chat surface for your personal OpenClaw runtime.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
            Ready
          </span>
        </div>

        <div className="mt-5 rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Runtime container</p>
          <p className="mt-1 break-all text-sm font-medium">
            {containerName || 'unknown'}
          </p>
        </div>
      </aside>

      <section className="flex min-h-[72vh] flex-col rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Chat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Transitional short-path chat. Next step is Gateway WebSocket alignment with OpenClaw /chat.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-between">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
            {messages.length === 0 ? (
              <div className="m-auto max-w-xl text-center text-sm text-muted-foreground">
                Start chatting with your MyClawGo runtime.
              </div>
            ) : null}
            {messages.map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}-${msg.timestamp || ''}`}
                className={msg.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}
              >
                <div
                  className={
                    msg.role === 'user'
                      ? 'rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground'
                      : 'rounded-2xl bg-muted px-4 py-3 text-sm text-foreground'
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t px-6 py-4">
            <div className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={sending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </section>
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
        | (RuntimeStatus & { mode?: string })
        | { ok?: boolean; error?: string; mode?: string; containerName?: string };
      if (!res.ok || !data || data.ok !== true) {
        const error = 'error' in (data || {}) ? (data as { error?: string }).error : undefined;
        setStatus({ ok: false, error: error || 'Failed to create MyClawGo' });
        return;
      }
      setStatus({
        ok: true,
        state: 'ready',
        reason: 'runtime-created',
        containerName: data.containerName,
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Your MyClawGo workspace chat will live here.
        </p>
      </div>

      {!status ? (
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking your MyClawGo status…</p>
        </div>
      ) : null}

      {status?.ok && status.state === 'not_created' ? (
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <h2 className="text-xl font-semibold">Create MyClawGo</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Create your private OpenClaw cloud workspace first. After it is ready,
              you will enter chat directly.
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {creating ? 'Creating…' : 'Create MyClawGo'}
            </button>
          </div>
        </div>
      ) : null}

      {status?.ok && status.state === 'ready' ? (
        <ReadyChatLayout containerName={status.containerName} />
      ) : null}

      {status && !status.ok ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {status.error}
        </div>
      ) : null}
    </div>
  );
}

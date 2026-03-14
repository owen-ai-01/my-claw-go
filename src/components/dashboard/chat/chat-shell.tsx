'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

type GatewayConnectionInfo = {
  ok: boolean;
  gateway?: {
    wsUrl?: string;
    sessionKey?: string;
  };
};

type GatewayResponse = {
  type?: string;
  id?: string;
  ok?: boolean;
  payload?: unknown;
  error?: { message?: string };
};

type GatewayEvent = {
  type?: string;
  event?: string;
  payload?: {
    state?: 'delta' | 'final' | 'error' | 'aborted';
    errorMessage?: string;
    message?: unknown;
    sessionKey?: string;
  };
};

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function messageTextFromPayload(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const msg = message as {
    text?: string;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text;

  if (!Array.isArray(msg.content)) return '';
  return msg.content
    .filter((entry) => entry?.type === 'text' && typeof entry?.text === 'string')
    .map((entry) => entry.text as string)
    .join('\n\n')
    .trim();
}

function ReadyChatLayout({ containerName }: { containerName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingMapRef = useRef<
    Map<string, { resolve: (payload: unknown) => void; reject: (error: Error) => void }>
  >(new Map());
  const sessionKeyRef = useRef('agent:main:main');
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = (method: string, params?: unknown) => {
    return new Promise<unknown>((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway WebSocket is not connected'));
        return;
      }
      const id = randomId();
      pendingMapRef.current.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  };

  useEffect(() => {
    let stopped = false;

    async function connectGateway() {
      setConnecting(true);
      setConnectionError(null);

      const connRes = await fetch('/api/chat/gateway-connection').catch(() => null);
      const connData = (await connRes?.json().catch(() => ({}))) as GatewayConnectionInfo;
      if (stopped) return;
      const wsUrl = connData?.gateway?.wsUrl;
      if (!wsUrl) {
        setConnecting(false);
        setConnectionError('No gateway wsUrl returned');
        return;
      }

      sessionKeyRef.current = connData?.gateway?.sessionKey || 'agent:main:main';

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (stopped) return;
        try {
          await request('connect', {
            minProtocol: 3,
            maxProtocol: 3,
            role: 'webchat',
            scopes: ['chat.read', 'chat.write'],
            caps: ['tool-events'],
            client: {
              id: 'myclawgo-web-chat',
              version: '0.1.0',
              platform: 'web',
              mode: 'webchat',
              instanceId: randomId(),
            },
            locale: 'zh-CN',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'myclawgo-web-chat',
          });

          const historyPayload = (await request('chat.history', {
            sessionKey: sessionKeyRef.current,
            limit: 200,
          })) as { messages?: unknown[] };

          if (!stopped) {
            const items = Array.isArray(historyPayload?.messages)
              ? historyPayload.messages
                  .map((raw) => {
                    const role =
                      (raw as { role?: string })?.role === 'user' ? 'user' : 'assistant';
                    const text = messageTextFromPayload(raw);
                    if (!text) return null;
                    return {
                      role,
                      text,
                    } as ChatMessage;
                  })
                  .filter((item): item is ChatMessage => Boolean(item))
              : [];
            setMessages(items);
            setConnecting(false);
          }
        } catch (error) {
          if (!stopped) {
            setConnecting(false);
            setConnectionError(error instanceof Error ? error.message : 'Failed to connect gateway');
          }
        }
      };

      ws.onmessage = (event) => {
        let data: GatewayResponse | GatewayEvent | null = null;
        try {
          data = JSON.parse(String(event.data)) as GatewayResponse | GatewayEvent;
        } catch {
          return;
        }
        if (!data) return;

        if (data.type === 'res') {
          const response = data as GatewayResponse;
          const id = response.id || '';
          const pending = pendingMapRef.current.get(id);
          if (!pending) return;
          pendingMapRef.current.delete(id);
          if (response.ok) {
            pending.resolve(response.payload);
          } else {
            pending.reject(new Error(response.error?.message || 'Gateway request failed'));
          }
          return;
        }

        if (data.type === 'event' && (data as GatewayEvent).event === 'chat') {
          const chatPayload = (data as GatewayEvent).payload;
          if (!chatPayload) return;
          if (chatPayload.state === 'error') {
            if (sendTimeoutRef.current) {
              clearTimeout(sendTimeoutRef.current);
              sendTimeoutRef.current = null;
            }
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: `⚠️ ${chatPayload.errorMessage || 'chat error'}` },
            ]);
            setSending(false);
            return;
          }
          if (chatPayload.state === 'final' || chatPayload.state === 'aborted') {
            if (sendTimeoutRef.current) {
              clearTimeout(sendTimeoutRef.current);
              sendTimeoutRef.current = null;
            }
            const text = messageTextFromPayload(chatPayload.message);
            if (text) {
              setMessages((prev) => [...prev, { role: 'assistant', text }]);
            }
            setSending(false);
          }
        }
      };

      ws.onerror = () => {
        if (!stopped) {
          setConnecting(false);
          setConnectionError('Gateway websocket connection failed');
        }
      };

      ws.onclose = () => {
        if (!stopped) {
          setConnecting(false);
        }
      };
    }

    connectGateway();

    return () => {
      stopped = true;
      pendingMapRef.current.forEach((pending) => pending.reject(new Error('connection closed')));
      pendingMapRef.current.clear();
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const placeholder = useMemo(() => 'Send a message to your MyClawGo…', []);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setMessages((m) => [...m, { role: 'assistant', text: '⚠️ WebSocket not connected' }]);
      return;
    }

    const optimisticUser: ChatMessage = { role: 'user', text };
    setMessages((m) => [...m, optimisticUser]);
    setInput('');
    setSending(true);

    try {
      await request('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: text,
        deliver: false,
        idempotencyKey: randomId(),
      });

      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
      }
      sendTimeoutRef.current = setTimeout(() => {
        setSending(false);
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: '⚠️ 当前消息发送后超时未收到回复（容器网关可能还在启动中），请稍后重试。',
          },
        ]);
      }, 20000);
    } catch (error) {
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: `⚠️ ${error instanceof Error ? error.message : 'Failed to send message'}`,
        },
      ]);
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
            {connecting ? 'Connecting' : 'Ready'}
          </span>
        </div>

        <div className="mt-5 rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Runtime container</p>
          <p className="mt-1 break-all text-sm font-medium">
            {containerName || 'unknown'}
          </p>
        </div>

        {connectionError ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            {connectionError}
          </div>
        ) : null}
      </aside>

      <section className="flex min-h-[72vh] flex-col rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Chat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            WebSocket proxy mode: /chat → platform proxy → your Docker OpenClaw gateway.
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
                disabled={sending || connecting}
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

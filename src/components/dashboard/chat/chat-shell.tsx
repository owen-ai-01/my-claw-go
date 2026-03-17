'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useCreditBalance } from '@/hooks/use-credits';
import { Routes } from '@/routes';
import { useRouter } from 'next/navigation';
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

type AgentItem = {
  id: string;
  name?: string;
  model?: string;
  isDefault?: boolean;
  identity?: {
    emoji?: string;
    avatar?: string;
  };
};

type AgentsResponse = {
  ok?: boolean;
  data?: {
    defaultAgentId?: string;
    agents?: AgentItem[];
  };
};

function agentLabel(agent: AgentItem) {
  return agent.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentItem) {
  return agent.identity?.emoji?.trim() || '🤖';
}

// ─── Chat window (only rendered when runtime is ready) ───────────────────────

function ChatLayout() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('main');
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [insufficientCredits, setInsufficientCredits] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as AgentsResponse;
        if (data.ok && data.data?.agents?.length) {
          const nextAgents = data.data.agents;
          setAgents(nextAgents);
          const preferred = data.data.defaultAgentId || nextAgents.find((agent) => agent.isDefault)?.id || nextAgents[0]?.id || 'main';
          setSelectedAgentId(preferred);
        } else {
          setAgents([{ id: 'main', name: 'main', isDefault: true }]);
          setSelectedAgentId('main');
        }
      } catch {
        setAgents([{ id: 'main', name: 'main', isDefault: true }]);
        setSelectedAgentId('main');
      } finally {
        setAgentsLoading(false);
      }
    };
    loadAgents();
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/chat/history?agentId=${encodeURIComponent(selectedAgentId)}`, { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { messages?: ChatMessage[] };
        };
        if (data.ok && data.data?.messages) {
          setMessages(data.data.messages);
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      } finally {
        setHistoryLoading(false);
      }
    };
    load();
  }, [selectedAgentId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, selectedAgentId]);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [
      ...m,
      { role: 'user', content: text, createdAt: new Date().toISOString() },
    ]);
    setInput('');
    setSending(true);
    setInsufficientCredits(false);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, agentId: selectedAgentId, timeoutMs: 90000 }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        data?: { reply?: string };
        error?: string | { message?: string };
        balance?: number;
      };

      // Insufficient credits → show buy-credits prompt
      if (res.status === 402 && data.code === 'insufficient_credits') {
        setInsufficientCredits(true);
        setMessages((m) => m.slice(0, -1));
        return;
      }

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

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || { id: selectedAgentId, name: selectedAgentId };

  return (
    <div className="grid h-[calc(100vh-10rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Agents</h2>
              <p className="mt-1 text-xs text-muted-foreground">Switch between your AI employees</p>
            </div>
            <button
              type="button"
              onClick={() => router.push(Routes.SettingsAgents)}
              className="rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Manage
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {agentsLoading ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">Loading agents…</div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => {
                const active = agent.id === selectedAgentId;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-base">
                        {agentEmoji(agent)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{agentLabel(agent)}</p>
                          {agent.isDefault && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">default</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">@{agent.id}</p>
                        {agent.model && (
                          <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{agent.model}</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm overflow-hidden overflow-x-hidden">
        <div className="border-b px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
                  {agentEmoji(selectedAgent)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{agentLabel(selectedAgent)}</p>
                  <p className="truncate text-xs text-muted-foreground">Chatting with @{selectedAgent.id}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`${Routes.SettingsAgents}`)}
              className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Config
            </button>
          </div>
        </div>

        {insufficientCredits && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span>⚠️ Insufficient credits. Please top up to continue chatting.</span>
            <button
              type="button"
              onClick={() => router.push(Routes.SettingsCredits)}
              className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Buy Credits
            </button>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6 sm:px-6">
          {historyLoading ? (
            <div className="m-auto text-sm text-muted-foreground">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="m-auto max-w-sm text-center">
              <p className="text-2xl mb-2">👋</p>
              <p className="text-sm text-muted-foreground">
                Start a conversation with {agentLabel(selectedAgent)}.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id || `${selectedAgentId}-${msg.role}-${idx}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary select-none">
                    {agentEmoji(selectedAgent)}
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
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
              <div className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary select-none">
                {agentEmoji(selectedAgent)}
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

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
              placeholder={`Message ${agentLabel(selectedAgent)}… (Enter to send)`}
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
          <p className="mt-1.5 text-center text-xs text-muted-foreground/40">
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function ChatShell() {
  const user = useCurrentUser();
  const router = useRouter();
  const { data: planData, isLoading: planLoading } = useCurrentPlan(user?.id);
  const { data: credits } = useCreditBalance();

  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [creating, setCreating] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (user === null) {
      router.replace(Routes.Login);
    }
  }, [user, router]);

  // Membership check: free plan → redirect to /pricing
  useEffect(() => {
    if (!planLoading && planData) {
      if (planData.currentPlan?.isFree) {
        router.replace(Routes.Pricing);
      }
    }
  }, [planData, planLoading, router]);

  // Load runtime status (only once plan is confirmed paid)
  useEffect(() => {
    if (planLoading) return;
    if (!planData || planData.currentPlan?.isFree) return;

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
  }, [planData, planLoading]);

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/chat/create', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        error?: string;
        containerName?: string;
        state?: string;
      };

      if (res.status === 402 || data.code === 'payment_required') {
        router.push(Routes.Pricing);
        return;
      }

      if (!res.ok || data.ok !== true) {
        setStatus({ ok: false, error: data.error || 'Failed to create workspace' });
        return;
      }

      setStatus({ ok: true, state: 'ready', reason: 'runtime-created', containerName: data.containerName });
    } finally {
      setCreating(false);
    }
  }

  if (!user || planLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader credits={credits} />
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader credits={credits} />
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking your workspace…</p>
        </div>
      </div>
    );
  }

  if (status.ok && status.state === 'not_created') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader credits={credits} />
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
        <PageHeader credits={credits} />
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {status.error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader credits={credits} />
      <ChatLayout />
    </div>
  );
}

function PageHeader({ credits }: { credits?: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your AI team, one chat surface.</p>
      </div>
      {credits !== undefined && (
        <div className="rounded-xl border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          💳 {credits.toLocaleString()} credits
        </div>
      )}
    </div>
  );
}

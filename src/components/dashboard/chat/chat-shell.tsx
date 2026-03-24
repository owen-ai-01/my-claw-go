'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useCreditBalance } from '@/hooks/use-credits';
import { Routes } from '@/routes';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
  routedAgentId?: string;
  status?: 'queued' | 'pending' | 'running' | 'done' | 'failed';
  taskId?: string | null;
};

type AgentItem = {
  id: string;
  name?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
  identity?: {
    name?: string;
    emoji?: string;
    avatar?: string;
    theme?: string;
  };
  telegram?: {
    accountId: string;
    enabled: boolean;
    hasBotToken: boolean;
    name?: string;
    bindingEnabled: boolean;
    webhookUrl?: string;
    webhookPath?: string;
  } | null;
};

type AgentDetail = AgentItem & {
  agentsMdPath: string | null;
  agentsMdExists: boolean;
};

type AgentsResponse = {
  ok?: boolean;
  data?: {
    defaultAgentId?: string;
    agents?: AgentItem[];
  };
};

type AgentResponse = {
  ok?: boolean;
  data?: AgentDetail;
};

type AgentsMdResponse = {
  ok?: boolean;
  data?: {
    agentId: string;
    path: string;
    content: string;
  };
};

function agentLabel(agent: Partial<AgentItem>) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id || 'Agent';
}

function agentEmoji(agent: Partial<AgentItem>) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function AgentConfigDrawer({
  open,
  onOpenChange,
  agentId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  onDeleted?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [agentsMd, setAgentsMd] = useState('');
  const [draftAgentsMd, setDraftAgentsMd] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftTelegramEnabled, setDraftTelegramEnabled] = useState(false);
  const [draftTelegramBindingEnabled, setDraftTelegramBindingEnabled] = useState(false);
  const [draftTelegramBotToken, setDraftTelegramBotToken] = useState('');
  const [draftTelegramAllowFrom, setDraftTelegramAllowFrom] = useState('');

  useEffect(() => {
    if (!open || !agentId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setSaveMessage(null);
      try {
        const [agentRes, agentsMdRes] = await Promise.all([
          fetch(`/api/agents/${encodeURIComponent(agentId)}`, { cache: 'no-store' }),
          fetch(`/api/agents/${encodeURIComponent(agentId)}/agents-md`, { cache: 'no-store' }),
        ]);

        const agentPayload = (await agentRes.json().catch(() => ({}))) as AgentResponse;
        if (!agentRes.ok || agentPayload.ok !== true || !agentPayload.data) {
          throw new Error('Failed to load agent details');
        }

        let nextAgentsMd = '';
        if (agentsMdRes.ok) {
          const agentsMdPayload = (await agentsMdRes.json().catch(() => ({}))) as AgentsMdResponse;
          if (agentsMdPayload.ok === true) {
            nextAgentsMd = agentsMdPayload.data?.content || '';
          }
        }

        if (cancelled) return;
        setAgent(agentPayload.data);
        setAgentsMd(nextAgentsMd);
        setDraftAgentsMd(nextAgentsMd);
        setDraftModel(agentPayload.data.model || '');
        setDraftTelegramEnabled(agentPayload.data.telegram?.enabled ?? false);
        setDraftTelegramBindingEnabled(agentPayload.data.telegram?.bindingEnabled ?? false);
        setDraftTelegramBotToken('');
        // Show current allowFrom if exists (backend will return it in next update)
        setDraftTelegramAllowFrom('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load agent details');
        setAgent(null);
        setAgentsMd('');
        setDraftAgentsMd('');
        setDraftModel('');
        setDraftTelegramEnabled(false);
        setDraftTelegramBindingEnabled(false);
        setDraftTelegramBotToken('');
        setDraftTelegramAllowFrom('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  async function onSave() {
    if (!agent || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const [modelRes, agentsMdRes, telegramRes] = await Promise.all([
        fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: draftModel }),
        }),
        fetch(`/api/agents/${encodeURIComponent(agent.id)}/agents-md`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: draftAgentsMd }),
        }),
        fetch(`/api/agents/${encodeURIComponent(agent.id)}/channels/telegram`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            enabled: draftTelegramEnabled,
            bindingEnabled: draftTelegramBindingEnabled,
            botToken: draftTelegramBotToken,
            allowFrom: draftTelegramAllowFrom.trim() ? draftTelegramAllowFrom.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          }),
        }),
      ]);

      const modelPayload = await modelRes.json().catch(() => ({}));
      const agentsMdPayload = await agentsMdRes.json().catch(() => ({}));
      const telegramPayload = await telegramRes.json().catch(() => ({}));
      if (!modelRes.ok || modelPayload.ok !== true) {
        throw new Error(modelPayload?.error?.message || modelPayload?.error || 'Failed to save model');
      }
      if (!agentsMdRes.ok || agentsMdPayload.ok !== true) {
        throw new Error(agentsMdPayload?.error?.message || agentsMdPayload?.error || 'Failed to save AGENTS.md');
      }
      if (!telegramRes.ok || telegramPayload.ok !== true) {
        throw new Error(telegramPayload?.error?.message || telegramPayload?.error || 'Failed to save Telegram settings');
      }

      const refreshedAgent = telegramPayload.data as AgentDetail;
      setAgent(refreshedAgent);
      setAgentsMd(draftAgentsMd);
      setDraftTelegramBotToken('');
      setSaveMessage('Saved');
      toast.success('Agent settings saved successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save changes';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!agent || deleting || !confirmDelete) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/delete`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data?.error?.message || data?.error || 'Failed to delete agent');
      }

      toast.success(`Agent ${agent.id} deleted successfully`);
      onOpenChange(false);
      if (onDeleted) onDeleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete agent';
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 gap-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm">
              {agentEmoji(agent || { id: agentId })}
            </span>
            <span>{agentLabel(agent || { id: agentId, name: agentId })}</span>
          </SheetTitle>
          <SheetDescription>
            Configure the current agent without leaving chat. Telegram-style workflow, but on the web.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Loading agent details…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : agent ? (
            <div className="space-y-5">
              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Agent Basics</h3>
                  {saveMessage ? <span className="text-xs text-emerald-600">{saveMessage}</span> : null}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Agent ID</p>
                    <p className="mt-1 font-medium">@{agent.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Model</p>
                    <input
                      value={draftModel}
                      onChange={(e) => setDraftModel(e.target.value)}
                      placeholder="openrouter/openai/gpt-4o-mini"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Workspace</p>
                    <p className="mt-1 break-all font-medium">{agent.workspace || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Theme</p>
                    <p className="mt-1 break-all font-medium">{agent.identity?.theme || '—'}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">AGENTS.md</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Each agent has its own workspace-level AGENTS.md.</p>
                  </div>
                  <div className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
                    {agent.agentsMdExists ? 'Loaded' : 'Missing'}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs text-muted-foreground break-all">{agent.agentsMdPath || 'No AGENTS.md path'}</p>
                  <textarea
                    value={draftAgentsMd}
                    onChange={(e) => setDraftAgentsMd(e.target.value)}
                    className="min-h-[260px] w-full resize-none rounded-xl border bg-muted/30 p-3 font-mono text-xs leading-6 outline-none"
                  />
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Telegram</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Account ID</p>
                    <p className="mt-1 font-medium">{agent.telegram?.accountId || agent.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bot Token</p>
                    <input
                      value={draftTelegramBotToken}
                      onChange={(e) => setDraftTelegramBotToken(e.target.value)}
                      placeholder={agent.telegram?.hasBotToken ? 'Leave blank to keep current token' : 'Paste Telegram bot token'}
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Allowed Telegram IDs</p>
                    <input
                      value={draftTelegramAllowFrom}
                      onChange={(e) => setDraftTelegramAllowFrom(e.target.value)}
                      placeholder="Leave blank for * (allow all), or comma-separated IDs: 123456,789012"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Default: * (allow all users). Enter specific Telegram user IDs to restrict access.</p>
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draftTelegramEnabled}
                      onChange={(e) => setDraftTelegramEnabled(e.target.checked)}
                    />
                    <span className="text-sm">Enable Telegram for this agent</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draftTelegramBindingEnabled}
                      onChange={(e) => setDraftTelegramBindingEnabled(e.target.checked)}
                    />
                    <span className="text-sm">Route this Telegram account to the current agent</span>
                  </label>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Status</p>
                    <p className="mt-1 font-medium">{agent.telegram?.hasBotToken ? 'Configured' : 'Not configured'} / {agent.telegram?.bindingEnabled ? 'Bound' : 'Unbound'}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Save updates model, AGENTS.md, and Telegram settings together.
                  </p>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
                {agent.id === 'main' ? (
                  <p className="mt-2 text-xs text-red-600">
                    The main agent is protected and cannot be deleted.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-red-600">
                      Delete this agent permanently. This action cannot be undone.
                    </p>
                    {!confirmDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        disabled={deleting}
                        className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete Agent
                      </button>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleting ? 'Deleting…' : 'Confirm Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddAgentDrawer({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId.trim(),
          name: name.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data?.error?.message || data?.error || 'Failed to create agent');
      }

      toast.success(`Agent ${agentId} created successfully`);
      setAgentId('');
      setName('');
      setModel('');
      await Promise.resolve(onSuccess());
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create agent';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 gap-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-base">Add Agent</SheetTitle>
          <SheetDescription>Create a new AI employee for your team.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Agent ID *</label>
              <input
                required
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="sales, support, dev, etc."
                pattern="[a-zA-Z0-9_-]+"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">Lowercase letters, numbers, hyphens, underscores only</p>
            </div>

            <div>
              <label className="text-sm font-medium">Display Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales Agent, Support Bot, etc."
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">Optional: Human-friendly name for this agent</p>
            </div>

            <div>
              <label className="text-sm font-medium">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="openrouter/anthropic/claude-sonnet-4.6"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">Optional: Leave blank to use default model</p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agentId.trim() || submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type Group = {
  id: string;
  name: string;
  description?: string;
  type: 'project' | 'department' | 'temporary';
  leaderId: string;
  members: string[];
};

function ChatLayout() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('main');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTaskStatus, setActiveTaskStatus] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [agentsRes, groupsRes] = await Promise.all([
          fetch('/api/agents', { cache: 'no-store' }),
          fetch('/api/groups', { cache: 'no-store' }),
        ]);

        const agentsData = (await agentsRes.json().catch(() => ({}))) as AgentsResponse;
        if (agentsData.ok && agentsData.data?.agents?.length) {
          const nextAgents = agentsData.data.agents;
          setAgents(nextAgents);
          const preferred = agentsData.data.defaultAgentId || nextAgents.find((agent) => agent.isDefault)?.id || nextAgents[0]?.id || 'main';
          setSelectedAgentId(preferred);
        } else {
          setAgents([{ id: 'main', name: 'main', isDefault: true }]);
          setSelectedAgentId('main');
        }

        const groupsData = await groupsRes.json().catch(() => ({}));
        if (groupsData.ok && groupsData.data?.groups) {
          setGroups(groupsData.data.groups);
        }
      } catch {
        setAgents([{ id: 'main', name: 'main', isDefault: true }]);
        setSelectedAgentId('main');
      } finally {
        setAgentsLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedAgentId && !selectedGroupId) return;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const targetId = selectedGroupId || selectedAgentId;
        const queryParam = selectedGroupId ? `groupId=${encodeURIComponent(selectedGroupId)}` : `agentId=${encodeURIComponent(selectedAgentId)}`;
        const res = await fetch(`/api/chat/history?${queryParam}`, { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { messages?: ChatMessage[]; task?: { status?: string } | null };
        };
        if (data.ok && data.data?.messages) {
          setMessages(data.data.messages);
          setActiveTaskStatus(data.data.task?.status || null);
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
  }, [selectedAgentId, selectedGroupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTaskStatus, sending, selectedAgentId]);

  useEffect(() => {
    if (!selectedGroupId && (activeTaskStatus === 'queued' || activeTaskStatus === 'running')) {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/chat/history?agentId=${encodeURIComponent(selectedAgentId)}`, { cache: 'no-store' });
          const data = await res.json().catch(() => ({})) as {
            ok?: boolean;
            data?: { messages?: ChatMessage[]; task?: { status?: string } | null };
          };
          if (data.ok && data.data?.messages) {
            setMessages(data.data.messages);
            setActiveTaskStatus(data.data.task?.status || null);
          }
        } catch {}
      }, 1000); // 1s polling: model finishes ~28s, we want to show reply within 1s of it landing
      return () => clearInterval(timer);
    }
  }, [activeTaskStatus, selectedAgentId, selectedGroupId]);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;
    // Only add user message optimistically — bounce indicator handles the waiting state
    setMessages((m) => [...m,
      { role: 'user', content: text, createdAt: new Date().toISOString(), status: 'done' },
    ]);
    setInput('');
    setSending(true);
    setInsufficientCredits(false);

    try {
      const payload: any = { message: text, timeoutMs: 90000 };
      if (selectedGroupId) {
        payload.groupId = selectedGroupId;
      } else {
        payload.agentId = selectedAgentId;
      }

      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        data?: { taskId?: string; assistantMessageId?: string; status?: string };
        error?: string | { message?: string };
      };

      if (res.status === 402 && data.code === 'insufficient_credits') {
        setInsufficientCredits(true);
        setMessages((m) => m.slice(0, -1)); // remove the optimistic user message
        return;
      }

      if (!res.ok || data.ok !== true) {
        const rawErr = typeof data.error === 'string' ? data.error : (data.error as { message?: string })?.message;
        const errMsg = data.code === 'bridge_timeout'
          ? 'Agent response timed out. Please retry.'
          : data.code === 'bridge_invalid_response'
            ? 'Agent returned an invalid response.'
            : data.code === 'empty_reply'
              ? 'Agent returned an empty reply.'
              : rawErr || 'Failed to send message';
        setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${errMsg}`, createdAt: new Date().toISOString() }]);
        return;
      }

      setActiveTaskStatus(data.data?.status || 'queued');
      await fetch(`/api/chat/history?agentId=${encodeURIComponent(selectedAgentId)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((history) => {
          if (history?.ok && history?.data?.messages) {
            setMessages(history.data.messages);
            setActiveTaskStatus(history.data.task?.status || null);
          }
        })
        .catch(() => {});
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `⚠️ ${msg}`, createdAt: new Date().toISOString(), status: 'failed' },
      ]);
    } finally {
      setSending(false);
    }
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || { id: selectedAgentId, name: selectedAgentId };
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const selectedGroupLeader = selectedGroup ? agents.find((agent) => agent.id === selectedGroup.leaderId) : null;
  const currentTitle = selectedGroup ? selectedGroup.name : agentLabel(selectedAgent);
  const currentSubtitle = selectedGroup
    ? `Group · ${selectedGroup.members.length} members · Leader ${selectedGroupLeader ? agentLabel(selectedGroupLeader) : `@${selectedGroup?.leaderId}`}`
    : `Chatting with @${selectedAgent.id}`;
  const inputPlaceholder = selectedGroup
    ? `Message ${selectedGroup.name}… Use @agentId to route to a member`
    : `Message ${agentLabel(selectedAgent)}… (Enter to send)`;

  // Show bounce indicator while: (a) API call in flight, or (b) background task running
  const isWaiting = sending || activeTaskStatus === 'queued' || activeTaskStatus === 'running';

  // Filter out placeholder assistant messages (status=queued/running) — shown as bounce instead
  const visibleMessages = messages.filter(
    (msg) => !(msg.role === 'assistant' && (msg.status === 'queued' || msg.status === 'running'))
  );

  function switchToAgent(agentId: string) {
    setSelectedAgentId(agentId);
    setSelectedGroupId(null);
  }

  function switchToGroup(groupId: string) {
    setSelectedGroupId(groupId);
  }

  return (
    <>
      <div className="grid h-[calc(100vh-10rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Chats</h2>
                <p className="mt-1 text-xs text-muted-foreground">Agents & Groups</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {agentsLoading ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-3">
                {/* Agents Section */}
                <div>
                  <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">Agents</div>
                  <div className="space-y-2">
                    {agents.map((agent) => {
                      const active = !selectedGroupId && agent.id === selectedAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => switchToAgent(agent.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/60'}`}
                        >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-base">
                          {agentEmoji(agent)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{agentLabel(agent)}</p>
                            {agent.isDefault && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">default</span>}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">@{agent.id}</p>
                          {agent.model && <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{agent.model}</p>}
                        </div>
                      </div>
                    </button>
                  );
                })}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm overflow-hidden overflow-x-hidden">
          <div className="border-b px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
                    {selectedGroup ? '👥' : agentEmoji(selectedAgent)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{currentTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{currentSubtitle}</p>
                  </div>
                </div>
                {selectedGroup && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2.5 py-1">Type: {selectedGroup.type}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1">Members: {selectedGroup.members.length}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1">Leader: {selectedGroupLeader ? agentLabel(selectedGroupLeader) : `@${selectedGroup.leaderId}`}</span>
                    {selectedGroup.description ? <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-1">{selectedGroup.description}</span> : null}
                  </div>
                )}
              </div>
              {!selectedGroup && (
                <button
                  type="button"
                  onClick={() => setConfigOpen(true)}
                  className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  Config
                </button>
              )}
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
            ) : visibleMessages.length === 0 && !isWaiting ? (
              <div className="m-auto max-w-sm text-center">
                <p className="text-2xl mb-2">👋</p>
                <p className="text-sm text-muted-foreground">Start a conversation with {selectedGroup ? selectedGroup.name : agentLabel(selectedAgent)}.</p>
              </div>
            ) : (
              visibleMessages.map((msg, idx) => {
                const routedAgent = msg.routedAgentId ? agents.find((agent) => agent.id === msg.routedAgentId) || selectedAgent : selectedAgent;
                return (
                  <div key={msg.id || `${selectedAgentId}-${msg.role}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary select-none">
                        {selectedGroup ? agentEmoji(routedAgent) : agentEmoji(selectedAgent)}
                      </div>
                    )}
                    <div>
                      {msg.role === 'assistant' && selectedGroup && msg.routedAgentId ? (
                        <div className="mb-1 ml-1 text-[11px] text-muted-foreground">
                          {agentLabel(routedAgent)} · @{msg.routedAgentId}
                        </div>
                      ) : null}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator — shown while sending OR while background task is running */}
            {isWaiting && (
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
                placeholder={inputPlaceholder}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none max-h-[120px] leading-relaxed py-0.5"
              />
              <button type="button" onClick={onSend} disabled={sending || !input.trim()} className="flex-shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40 transition-opacity">
                {sending ? '…' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground/40">
              {selectedGroup ? 'Shift+Enter for new line · Tip: use @agentId in group chat' : 'Shift+Enter for new line'}
            </p>
          </div>
        </div>
      </div>

      <AgentConfigDrawer
        open={configOpen}
        onOpenChange={setConfigOpen}
        agentId={selectedAgentId}
        onDeleted={async () => {
          const res = await fetch('/api/agents', { cache: 'no-store' });
          const data = (await res.json().catch(() => ({}))) as AgentsResponse;
          if (data.ok && data.data?.agents?.length) {
            setAgents(data.data.agents);
            setSelectedAgentId(data.data.agents[0]?.id || 'main');
          }
        }}
      />
      <AddAgentDrawer
        open={addAgentOpen}
        onOpenChange={setAddAgentOpen}
        onSuccess={async () => {
          const res = await fetch('/api/agents', { cache: 'no-store' });
          const data = (await res.json().catch(() => ({}))) as AgentsResponse;
          if (data.ok && data.data?.agents?.length) {
            setAgents(data.data.agents);
          }
        }}
      />
    </>
  );
}

export function ChatShell() {
  const user = useCurrentUser();
  const router = useRouter();
  const { data: planData, isLoading: planLoading } = useCurrentPlan(user?.id);
  const { data: credits } = useCreditBalance();
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user === null) router.replace(Routes.Login);
  }, [user, router]);

  useEffect(() => {
    if (!planLoading && planData?.currentPlan?.isFree) router.replace(Routes.Pricing);
  }, [planData, planLoading, router]);

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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; containerName?: string };
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
    return <div className="flex flex-col gap-4"><PageHeader credits={credits} /><div className="rounded-2xl border bg-card p-8 shadow-sm"><p className="text-sm text-muted-foreground">Loading…</p></div></div>;
  }

  if (!status) {
    return <div className="flex flex-col gap-4"><PageHeader credits={credits} /><div className="rounded-2xl border bg-card p-8 shadow-sm"><p className="text-sm text-muted-foreground">Checking your workspace…</p></div></div>;
  }

  if (status.ok && status.state === 'not_created') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader credits={credits} />
        <div className="rounded-2xl border bg-card p-10 shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <div className="mb-4 text-4xl">🚀</div>
            <h2 className="text-xl font-semibold">Set up your workspace</h2>
            <p className="mt-2 text-sm text-muted-foreground">Create your private AI workspace to start chatting.</p>
            <button type="button" onClick={onCreate} disabled={creating} className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {creating ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!status.ok) {
    return <div className="flex flex-col gap-4"><PageHeader credits={credits} /><div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{status.error}</div></div>;
  }

  return <div className="flex flex-col gap-4"><PageHeader credits={credits} /><ChatLayout /></div>;
}

function PageHeader({ credits }: { credits?: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your AI team, one chat surface.</p>
      </div>
      {credits !== undefined && <div className="rounded-xl border bg-card px-3 py-1.5 text-xs text-muted-foreground">💳 {credits.toLocaleString()} credits</div>}
    </div>
  );
}

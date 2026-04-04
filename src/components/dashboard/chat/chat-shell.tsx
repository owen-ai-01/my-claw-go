'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useCreditBalance } from '@/hooks/use-credits';
import { ModelSelect } from '@/components/ui/model-select';
import { AgentAvatarPicker } from '@/components/settings/agents/agent-avatar-picker';
import { Routes } from '@/routes';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCcw, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  enabled?: boolean;
  role?: string;
  description?: string;
  department?: string;
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

type AgentDocResponse = {
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

function normalizeMentionsForDisplay(content: string, memberIds: string[], currentSpeakerId?: string) {
  const safe = String(content || '');
  if (!safe || !Array.isArray(memberIds) || memberIds.length === 0) return safe;

  const mentions = [...safe.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => String(m[1] || ''));
  if (mentions.length === 0) return safe;

  const memberSet = new Set(memberIds);
  const pool = memberIds.filter((id) => id !== currentSpeakerId);
  const fallback = pool[0] || memberIds[0];

  let chosen = mentions.find((id) => memberSet.has(id) && id !== currentSpeakerId) || null;
  if (!chosen) chosen = fallback;
  if (!chosen) return safe;

  let used = false;
  return safe.replace(/@([a-zA-Z0-9_-]+)/g, () => {
    if (!used) {
      used = true;
      return `@${chosen}`;
    }
    return '';
  });
}

function formatMessageTime(createdAt?: string) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Render message text with @agentId highlighted as colored badges */
function renderMessageContent(
  content: string,
  knownMembers: { id: string; name?: string; identity?: { name?: string; emoji?: string } }[] = []
) {
  const parts = content.split(/(@[a-zA-Z0-9_-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const id = part.slice(1);
      const member = knownMembers.find((m) => m.id === id);
      return (
        <span
          key={i}
          title={member ? agentLabel(member) : id}
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
        >
          {member ? agentEmoji(member) : null}
          @{id}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
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
  const [draftDocs, setDraftDocs] = useState<Record<'agents' | 'identity' | 'user' | 'soul' | 'tools', string>>({
    agents: '',
    identity: '',
    user: '',
    soul: '',
    tools: '',
  });
  const [activeDocTab, setActiveDocTab] = useState<'agents' | 'identity' | 'user' | 'soul' | 'tools'>('agents');
  const [editingDocs, setEditingDocs] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftDepartment, setDraftDepartment] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);
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
        const agentRes = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, { cache: 'no-store' });

        const agentPayload = (await agentRes.json().catch(() => ({}))) as AgentResponse;
        if (!agentRes.ok || agentPayload.ok !== true || !agentPayload.data) {
          throw new Error('Failed to load agent details');
        }

        const docKeys: Array<'agents' | 'identity' | 'user' | 'soul' | 'tools'> = ['agents', 'identity', 'user', 'soul', 'tools'];
        const docEntries = await Promise.all(
          docKeys.map(async (docKey) => {
            const res = await fetch(`/api/chat/agent-docs/${encodeURIComponent(agentId)}/${docKey}`, { cache: 'no-store' });
            const payload = (await res.json().catch(() => ({}))) as AgentDocResponse;
            return [docKey, res.ok && payload.ok === true ? payload.data?.content || '' : ''] as const;
          })
        );

        if (cancelled) return;
        setAgent(agentPayload.data);
        setDraftDocs(Object.fromEntries(docEntries) as Record<'agents' | 'identity' | 'user' | 'soul' | 'tools', string>);
        setDraftName(agentPayload.data.name || agentPayload.data.identity?.name || '');
        setDraftRole(agentPayload.data.role || '');
        setDraftDescription(agentPayload.data.description || '');
        setDraftDepartment(agentPayload.data.department || '');
        setDraftEnabled(agentPayload.data.enabled !== false);
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
        setDraftDocs({ agents: '', identity: '', user: '', soul: '', tools: '' });
        setEditingDocs(false);
        setDraftName('');
        setDraftRole('');
        setDraftDescription('');
        setDraftDepartment('');
        setDraftEnabled(true);
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
      const docKeys: Array<'agents' | 'identity' | 'user' | 'soul' | 'tools'> = ['agents', 'identity', 'user', 'soul', 'tools'];
      const [modelRes, ...restResponses] = await Promise.all([
        fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: draftName,
            model: draftModel,
          }),
        }),
        ...docKeys.map((docKey) =>
          fetch(`/api/chat/agent-docs/${encodeURIComponent(agent.id)}/${docKey}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: draftDocs[docKey] || '' }),
          })
        ),
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
      const docResponses = restResponses.slice(0, docKeys.length);
      const telegramRes = restResponses[docKeys.length];
      const docPayloads = await Promise.all(docResponses.map((r) => r.json().catch(() => ({}))));
      const telegramPayload = await telegramRes.json().catch(() => ({}));
      if (!modelRes.ok || modelPayload.ok !== true) {
        throw new Error(modelPayload?.error?.message || modelPayload?.error || 'Failed to save model');
      }
      const failedDocIndex = docResponses.findIndex((res, idx) => !res.ok || (docPayloads[idx] as any)?.ok !== true);
      if (failedDocIndex >= 0) {
        const p: any = docPayloads[failedDocIndex] || {};
        throw new Error(p?.error?.message || p?.error || 'Failed to save markdown files');
      }
      if (!telegramRes.ok || (telegramPayload as any).ok !== true) {
        throw new Error((telegramPayload as any)?.error?.message || (telegramPayload as any)?.error || 'Failed to save Telegram settings');
      }

      const refreshedAgent = (telegramPayload as any).data as AgentDetail;
      setAgent(refreshedAgent);
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
                    <p className="text-xs text-muted-foreground">Display Name</p>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="e.g. Growth Analyst"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <input
                      value={draftRole}
                      onChange={(e) => setDraftRole(e.target.value)}
                      placeholder="e.g. SEO strategist"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Department</p>
                    <input
                      value={draftDepartment}
                      onChange={(e) => setDraftDepartment(e.target.value)}
                      placeholder="e.g. Marketing"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <textarea
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      placeholder="What this agent is responsible for"
                      className="mt-1 min-h-[84px] w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-xl border px-3 py-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Enabled</p>
                      <p className="mt-1 text-sm font-medium">{draftEnabled ? 'This agent can be used' : 'Disabled from active use'}</p>
                    </div>
                    <input type="checkbox" checked={draftEnabled} onChange={(e) => setDraftEnabled(e.target.checked)} className="h-4 w-4" />
                  </label>
                  <div>
                    <p className="text-xs text-muted-foreground">Model</p>
                    <div className="mt-1">
                      <ModelSelect value={draftModel} onChange={setDraftModel} placeholder="Default model" />
                    </div>
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
                    <h3 className="text-sm font-semibold">Markdown Files</h3>
                    <p className="mt-1 text-xs text-muted-foreground">AGENTS.md / IDENTITY.md / USER.md / SOUL.md / TOOLS.md</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDocs((v) => !v)}
                    className="rounded-lg border px-3 py-1 text-xs hover:bg-muted"
                  >
                    {editingDocs ? 'View' : 'Edit'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ['agents', 'AGENTS.md'],
                    ['identity', 'IDENTITY.md'],
                    ['user', 'USER.md'],
                    ['soul', 'SOUL.md'],
                    ['tools', 'TOOLS.md'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveDocTab(key)}
                      className={`rounded-lg border px-3 py-1 text-xs ${activeDocTab === key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <textarea
                    value={draftDocs[activeDocTab] || ''}
                    onChange={(e) => setDraftDocs((prev) => ({ ...prev, [activeDocTab]: e.target.value }))}
                    readOnly={!editingDocs}
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
                    Save updates model, markdown files, and Telegram settings together.
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
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('/avatars/agents/robot-main.svg');
  const [emoji, setEmoji] = useState('🤖');
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
          avatar: avatar.trim() || undefined,
          emoji: emoji.trim() || undefined,
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
      setRole('');
      setDescription('');
      setAvatar('/avatars/agents/robot-main.svg');
      setEmoji('🤖');
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
              <label className="text-sm font-medium">Avatar</label>
              <div className="mt-1">
                <AgentAvatarPicker value={avatar} onChange={setAvatar} onEmojiChange={setEmoji} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Technical Developer"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief intro for this agent..."
                rows={3}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Model</label>
              <div className="mt-1">
                <ModelSelect value={model} onChange={setModel} placeholder="Default model" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Search model by name or ID. Leave blank to use default model</p>
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
  leaderId: string;
  members: string[];
  relay?: {
    enabled?: boolean;
    maxTurns?: number;
    cooldownMs?: number;
  };
};

type AgentStatus = {
  agentId: string;
  online: boolean;
  lastActivity: string | null;
  currentTask: { id?: string; description?: string; status?: string } | null;
  recentErrors: string[];
};

const GROUP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,29}[a-z0-9]$|^[a-z0-9]{2,30}$/;

function resolvePresence(status?: AgentStatus | null): 'busy' | 'online' | 'idle' | 'offline' {
  if (!status) return 'offline';
  if (status.currentTask) return 'busy';
  if (!status.online) return 'offline';
  if (status.lastActivity) {
    const ageMs = Date.now() - new Date(status.lastActivity).getTime();
    if (ageMs < 5 * 60 * 1000) return 'online';
  }
  return 'idle';
}

function presenceTone(presence: 'busy' | 'online' | 'idle' | 'offline') {
  return {
    busy: 'bg-blue-500',
    online: 'bg-green-500',
    idle: 'bg-gray-400',
    offline: 'bg-gray-300',
  }[presence];
}

function presenceLabel(presence: 'busy' | 'online' | 'idle' | 'offline') {
  return {
    busy: 'Busy',
    online: 'Online',
    idle: 'Idle',
    offline: 'Offline',
  }[presence];
}

function CreateGroupModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: AgentItem[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leaderId, setLeaderId] = useState(agents[0]?.id || 'main');
  const [memberIds, setMemberIds] = useState<string[]>(agents.slice(0, 1).map((a) => a.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const idValid = GROUP_ID_RE.test(groupId);
  const canSubmit = idValid && name.trim().length > 0 && memberIds.length >= 2 && !submitting;

  function toggleMember(agentId: string) {
    setMemberIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: groupId.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          leaderId,
          members: memberIds,
        }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Failed to create group');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">New Group</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Let agents collaborate in a shared space</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form id="create-group-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Group ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="e.g. tech-team"
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
              {groupId && !idValid && (
                <p className="mt-1 text-xs text-red-500">2–32 chars, lowercase / numbers / hyphens</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Group Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tech Team"
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this group work on?"
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Members <span className="text-red-500">*</span>
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(min 2)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {agents.map((agent) => {
                  const checked = memberIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleMember(agent.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        checked ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/60'
                      }`}
                    >
                      <span className="text-base">{agentEmoji(agent)}</span>
                      <span className="truncate">{agentLabel(agent)}</span>
                      {checked && <span className="ml-auto text-primary">✓</span>}
                    </button>
                  );
                })}
              </div>
              {agents.length < 2 && (
                <p className="mt-2 text-xs text-amber-600">⚠️ You need at least 2 agents to create a group. Add more agents first.</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Leader (responds to messages)</label>
              <select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              >
                {memberIds.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return (
                    <option key={id} value={id}>{agent ? agentLabel(agent) : id}</option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">The leader agent receives and routes messages in this group.</p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4">
          {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button
              type="submit"
              form="create-group-form"
              disabled={!canSubmit}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditGroupModal({
  group,
  agents,
  onClose,
  onUpdated,
  onDeleted,
}: {
  group: Group;
  agents: AgentItem[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onDeleted: (groupId: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [leaderId, setLeaderId] = useState(group.leaderId);
  const [memberIds, setMemberIds] = useState<string[]>(group.members);
  const [relayEnabled, setRelayEnabled] = useState(group.relay?.enabled !== false);
  const [relayMaxTurns, setRelayMaxTurns] = useState<number>(group.relay?.maxTurns ?? 6);
  const [relayCooldownMs, setRelayCooldownMs] = useState<number>(group.relay?.cooldownMs ?? 900);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function toggleMember(agentId: string) {
    setMemberIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  }

  useEffect(() => {
    if (!memberIds.includes(leaderId)) {
      setLeaderId(memberIds[0] || group.leaderId);
    }
  }, [memberIds, leaderId, group.leaderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || memberIds.length < 2 || !leaderId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          leaderId,
          members: memberIds,
          relay: {
            enabled: relayEnabled,
            maxTurns: Math.min(Math.max(Number(relayMaxTurns || 6), 1), 20),
            cooldownMs: Math.min(Math.max(Number(relayCooldownMs || 900), 0), 10000),
          },
        }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Failed to update group');
      await onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete group \"${group.name}\"? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Failed to delete group');
      await onDeleted(group.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Manage Group</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Update members, leader and group info</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form id="edit-group-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Group ID</label>
              <input value={group.id} disabled className="w-full rounded-xl border bg-muted/50 px-3 py-2 text-sm text-muted-foreground" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Group Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="What does this group work on?"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Members <span className="ml-1.5 text-xs font-normal text-muted-foreground">(min 2)</span></label>
              <div className="grid grid-cols-2 gap-2">
                {agents.map((agent) => {
                  const checked = memberIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleMember(agent.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        checked ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/60'
                      }`}
                    >
                      <span className="text-base">{agentEmoji(agent)}</span>
                      <span className="truncate">{agentLabel(agent)}</span>
                      {checked && <span className="ml-auto text-primary">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Leader</label>
              <select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              >
                {memberIds.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return <option key={id} value={id}>{agent ? agentLabel(agent) : id}</option>;
                })}
              </select>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3">
              <label className="flex items-center justify-between text-sm font-medium">
                <span>Auto Relay</span>
                <input
                  type="checkbox"
                  checked={relayEnabled}
                  onChange={(e) => setRelayEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">Leader can @mention next member and trigger automatic handoff chain.</p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Max relay turns</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={relayMaxTurns}
                    onChange={(e) => setRelayMaxTurns(Number(e.target.value || 6))}
                    disabled={!relayEnabled}
                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Cooldown (ms)</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={100}
                    value={relayCooldownMs}
                    onChange={(e) => setRelayCooldownMs(Number(e.target.value || 900))}
                    disabled={!relayEnabled}
                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Stop command in group: <code>#stop</code> or <code>#pause</code></p>
            </div>
          </form>
        </div>

        <div className="border-t px-5 py-4">
          {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Group'}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button
                type="submit"
                form="edit-group-form"
                disabled={!name.trim() || memberIds.length < 2 || !leaderId || deleting || submitting}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatLayout() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus | null>>({});
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
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionPopupRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0);

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
          const requestedAgentId = searchParams.get('agentId');
          const preferred = requestedAgentId && nextAgents.some((agent) => agent.id === requestedAgentId)
            ? requestedAgentId
            : agentsData.data.defaultAgentId || nextAgents.find((agent) => agent.isDefault)?.id || nextAgents[0]?.id || 'main';
          setSelectedAgentId(preferred);

          void Promise.all(
            nextAgents.map(async (agent) => {
              try {
                const sr = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/status`, { cache: 'no-store' });
                const sd = await sr.json().catch(() => ({})) as { ok?: boolean; data?: { status?: AgentStatus } };
                return [agent.id, sd.data?.status ?? null] as const;
              } catch {
                return [agent.id, null] as const;
              }
            })
          ).then((entries) => {
            setAgentStatuses(Object.fromEntries(entries));
          });
        } else {
          setAgents([{ id: 'main', name: 'main', isDefault: true }]);
          setSelectedAgentId('main');
        }

        const groupsData = await groupsRes.json().catch(() => ({})) as { ok?: boolean; data?: { groups?: Group[] } };
        if (groupsData.ok && groupsData.data?.groups) {
          setGroups(groupsData.data.groups);
          const requestedGroupId = searchParams.get('groupId');
          if (requestedGroupId && groupsData.data.groups.some((group) => group.id === requestedGroupId)) {
            setSelectedGroupId(requestedGroupId);
          }
        }
      } catch {
        setAgents([{ id: 'main', name: 'main', isDefault: true }]);
        setSelectedAgentId('main');
      } finally {
        setAgentsLoading(false);
      }
    };
    loadData();
  }, [searchParams]);

  useEffect(() => {
    if (!selectedAgentId && !selectedGroupId) return;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const targetId = selectedGroupId || selectedAgentId;
        const selectedGroupForQuery = selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : null;
        const groupMembersQuery = selectedGroupForQuery?.members?.length
          ? `&members=${encodeURIComponent(selectedGroupForQuery.members.join(','))}`
          : '';
        const queryParam = selectedGroupId
          ? `groupId=${encodeURIComponent(selectedGroupId)}${groupMembersQuery}`
          : `agentId=${encodeURIComponent(selectedAgentId)}`;
        const res = await fetch(`/api/chat/history?${queryParam}`, { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { messages?: ChatMessage[]; task?: { status?: string } | null };
        };
        if (data.ok && data.data?.messages) {
          const nextMessages = data.data.messages;
          const hasPendingAssistant = nextMessages.some((msg) => msg.role === 'assistant' && (msg.status === 'queued' || msg.status === 'running'));
          setMessages(nextMessages);
          setActiveTaskStatus(hasPendingAssistant ? (data.data.task?.status || 'running') : null);
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
  }, [selectedAgentId, selectedGroupId, groups]);

  useEffect(() => {
    const agentIdForOffice = selectedGroupId ? '' : selectedAgentId;
    fetch('/api/chat/active-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdForOffice }),
    }).catch(() => {});
  }, [selectedAgentId, selectedGroupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTaskStatus, sending, selectedAgentId]);

  useEffect(() => {
    if (!selectedGroupId && (activeTaskStatus === 'queued' || activeTaskStatus === 'running')) {
      let cancelled = false;
      let pollCount = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const poll = async () => {
        try {
          const res = await fetch(`/api/chat/history?agentId=${encodeURIComponent(selectedAgentId)}`, { cache: 'no-store' });
          const data = await res.json().catch(() => ({})) as {
            ok?: boolean;
            data?: { messages?: ChatMessage[]; task?: { status?: string } | null };
          };
          if (!cancelled && data.ok && data.data?.messages) {
            const nextMessages = data.data.messages;
            const hasPendingAssistant = nextMessages.some((msg) => msg.role === 'assistant' && (msg.status === 'queued' || msg.status === 'running'));
            setMessages(nextMessages);
            setActiveTaskStatus(hasPendingAssistant ? (data.data.task?.status || 'running') : null);
          }
        } catch {}

        if (cancelled) return;
        pollCount += 1;
        const nextDelayMs = pollCount < 10 ? 250 : 800;
        timer = setTimeout(poll, nextDelayMs);
      };

      timer = setTimeout(poll, 150);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }
  }, [activeTaskStatus, selectedAgentId, selectedGroupId]);

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setMessages((m) => [...m, { role: 'user', content: trimmed, createdAt: new Date().toISOString(), status: 'done' }]);
    setInput('');
    setSending(true);
    setInsufficientCredits(false);

    try {
      const payload: any = { message: trimmed, timeoutMs: 90000 };
      if (selectedGroupId) {
        payload.groupId = selectedGroupId;
        payload.groupMembers = selectedGroup?.members || [];
      } else payload.agentId = selectedAgentId;

      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        data?: { status?: string; reply?: string; routedAgentId?: string };
        error?: string | { message?: string };
      };

      if (res.status === 402 && data.code === 'insufficient_credits') {
        setInsufficientCredits(true);
        setMessages((m) => m.slice(0, -1));
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

      if (selectedGroupId) {
        setActiveTaskStatus(null);
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: data.data?.reply || '',
            createdAt: new Date().toISOString(),
            status: 'done',
            routedAgentId: data.data?.routedAgentId,
          },
        ]);

        // Group auto-relay may continue in background; short polling to pull fresh turns
        let pollCount = 0;
        const pollGroupHistory = async () => {
          try {
            const membersQuery = selectedGroup?.members?.length
              ? `&members=${encodeURIComponent(selectedGroup.members.join(','))}`
              : '';
            const res = await fetch(`/api/chat/history?groupId=${encodeURIComponent(selectedGroupId)}${membersQuery}`, { cache: 'no-store' });
            const history = await res.json().catch(() => ({})) as { ok?: boolean; data?: { messages?: ChatMessage[] } };
            if (history?.ok && history?.data?.messages) {
              setMessages(history.data.messages);
            }
          } catch {}

          pollCount += 1;
          if (pollCount < 10) {
            setTimeout(pollGroupHistory, 900);
          }
        };
        setTimeout(pollGroupHistory, 400);
      } else {
        setActiveTaskStatus(data.data?.status || 'queued');
        await fetch(`/api/chat/history?agentId=${encodeURIComponent(selectedAgentId)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((history) => {
            if (history?.ok && history?.data?.messages) {
              const nextMessages = history.data.messages as ChatMessage[];
              const hasPendingAssistant = nextMessages.some((msg) => msg.role === 'assistant' && (msg.status === 'queued' || msg.status === 'running'));
              setMessages(nextMessages);
              setActiveTaskStatus(hasPendingAssistant ? (history.data.task?.status || 'running') : null);
            }
          })
          .catch(() => {});
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${msg}`, createdAt: new Date().toISOString(), status: 'failed' }]);
    } finally {
      setSending(false);
    }
  }

  const onSend = useCallback(async () => {
    await sendText(input);
  }, [input]);

  async function handleContextReset() {
    await sendText('/new');
  }

  async function handleContextCompress() {
    await sendText('/compact');
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || { id: selectedAgentId, name: selectedAgentId };
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const editingGroup = groups.find((g) => g.id === editingGroupId) || null;
  const selectedGroupLeader = selectedGroup ? agents.find((agent) => agent.id === selectedGroup.leaderId) : null;
  const selectedGroupMembers = selectedGroup
    ? selectedGroup.members.map((id) => agents.find((agent) => agent.id === id) || { id, name: id })
    : [];
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

  const slashCommands = [
    { cmd: '/compact', desc: 'Compress conversation context' },
    { cmd: '/new', desc: 'Start a new session context' },
    { cmd: '/reset', desc: 'Reset session context' },
    { cmd: '/status', desc: 'Show session status' },
  ];
  const showSlashCommands = input.trim().startsWith('/');
  const filteredSlashCommands = slashCommands.filter((item) => item.cmd.startsWith(input.trim().toLowerCase()));

  // ── @mention autocomplete ─────────────────────────────────────────────────
  const mentionMembers = selectedGroup ? selectedGroupMembers : [];
  const filteredMentionMembers = mentionQuery !== null
    ? mentionMembers.filter((m) =>
        m.id.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        (agentLabel(m)).toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];
  const showMentionPopup = !!selectedGroup && mentionQuery !== null && filteredMentionMembers.length > 0;

  // close mention popup when clicking outside
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showMentionPopup) return;
    function handleClickOutside(e: MouseEvent) {
      if (mentionPopupRef.current && !mentionPopupRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMentionPopup]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    // Detect @mention trigger: find last @ before cursor
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([a-zA-Z0-9_-]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionActiveIdx(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((memberId: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf('@');
    const before = input.slice(0, atIdx);
    const after = input.slice(cursor);
    const newVal = `${before}@${memberId} ${after}`;
    setInput(newVal);
    setMentionQuery(null);
    // Restore focus + move cursor after inserted mention
    requestAnimationFrame(() => {
      el.focus();
      const pos = atIdx + memberId.length + 2; // @name + space
      el.setSelectionRange(pos, pos);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }, [input]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopup && filteredMentionMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionActiveIdx((i) => (i + 1) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionActiveIdx((i) => (i - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentionMembers[mentionActiveIdx]?.id || filteredMentionMembers[0].id);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [showMentionPopup, filteredMentionMembers, mentionActiveIdx, insertMention, onSend]);

  function switchToAgent(agentId: string) {
    setSelectedAgentId(agentId);
    setSelectedGroupId(null);
  }

  function switchToGroup(groupId: string) {
    setSelectedGroupId(groupId);
  }

  async function reloadGroups() {
    try {
      const res = await fetch('/api/groups', { cache: 'no-store' });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; data?: { groups?: Group[] } };
      if (data.ok && data.data?.groups) setGroups(data.data.groups);
    } catch {}
  }

  async function handleGroupCreated() {
    await reloadGroups();
  }

  async function handleGroupDeleted(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setSelectedAgentId('main');
    }
  }

  return (
    <>
      {createGroupOpen && (
        <CreateGroupModal
          agents={agents}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={async () => { await handleGroupCreated(); setCreateGroupOpen(false); }}
        />
      )}
      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          agents={agents}
          onClose={() => setEditingGroupId(null)}
          onUpdated={reloadGroups}
          onDeleted={async (groupId) => {
            await handleGroupDeleted(groupId);
            setEditingGroupId(null);
          }}
        />
      )}
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
              <div className="space-y-4">
                {/* Agents Section */}
                <div>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-muted-foreground">Agents</span>
                    <button
                      type="button"
                      onClick={() => setAddAgentOpen(true)}
                      className="rounded-lg px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Add agent"
                    >
                      + Add
                    </button>
                  </div>
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
                            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-primary/10">
                              {agent.identity?.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={agent.identity.avatar} alt={agentLabel(agent)} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-base">{agentEmoji(agent)}</div>
                              )}
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

                {/* Groups Section */}
                <div>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-muted-foreground">Groups</span>
                    <button
                      type="button"
                      onClick={() => setCreateGroupOpen(true)}
                      className="rounded-lg px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Create group"
                    >
                      + New
                    </button>
                  </div>
                  {groups.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setCreateGroupOpen(true)}
                      className="w-full rounded-xl border border-dashed border-muted-foreground/30 px-3 py-3 text-left text-xs text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">👥</span>
                        <span>Create a group to let agents collaborate</span>
                      </div>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {groups.map((group) => {
                        const active = selectedGroupId === group.id;
                        const leaderAgent = agents.find((a) => a.id === group.leaderId);
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => switchToGroup(group.id)}
                            className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/60'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-base">
                                👥
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-sm font-medium">{group.name}</p>
                                  {group.relay?.enabled !== false ? (
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">relay on</span>
                                  ) : (
                                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">relay off</span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {group.members.length} members · Leader: {leaderAgent ? agentLabel(leaderAgent) : `@${group.leaderId}`}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1">Members: {selectedGroup.members.length}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1">Leader: {selectedGroupLeader ? agentLabel(selectedGroupLeader) : `@${selectedGroup.leaderId}`}</span>
                      {selectedGroup.description ? <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-1">{selectedGroup.description}</span> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {selectedGroupMembers.map((member) => {
                        const status = agentStatuses[member.id] || null;
                        const presence = resolvePresence(status);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => switchToAgent(member.id)}
                            className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                            title={`${agentLabel(member)} · ${presenceLabel(presence)}`}
                          >
                            <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-sm">
                              {agentEmoji(member)}
                              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background ${presenceTone(presence)}`} />
                            </span>
                            <span className="max-w-[84px] truncate">{agentLabel(member)}</span>
                            <span className="text-[10px] text-muted-foreground">{presenceLabel(presence)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {selectedGroup ? (
                <button
                  type="button"
                  onClick={() => setEditingGroupId(selectedGroup.id)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Manage Group
                </button>
              ) : (
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
                const speakerId = selectedGroup
                  ? (msg.routedAgentId || selectedGroup.leaderId)
                  : selectedAgent.id;
                const speakerAgent = agents.find((agent) => agent.id === speakerId) || selectedAgent;
                const displayContent = selectedGroup
                  ? normalizeMentionsForDisplay(msg.content, selectedGroup.members, speakerId)
                  : msg.content;
                const timeText = formatMessageTime(msg.createdAt);

                return (
                  <div key={msg.id || `${selectedAgentId}-${msg.role}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary select-none">
                        {selectedGroup ? agentEmoji(speakerAgent) : agentEmoji(selectedAgent)}
                      </div>
                    )}
                    <div>
                      {msg.role === 'assistant' && selectedGroup ? (
                        <div className="mb-1 ml-1 text-[11px] text-muted-foreground">
                          {agentLabel(speakerAgent)} · @{speakerId}
                        </div>
                      ) : null}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                        {selectedGroup
                          ? renderMessageContent(displayContent, selectedGroupMembers)
                          : msg.content}
                      </div>
                      {timeText ? (
                        <div className={`mt-1 text-[10px] text-muted-foreground ${msg.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}>
                          {timeText}
                        </div>
                      ) : null}
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
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleContextCompress}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Compress
                </button>
                <button
                  type="button"
                  onClick={handleContextReset}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Reset Context
                </button>
              </div>
            </div>
            {/* Slash commands popup */}
            {showSlashCommands && filteredSlashCommands.length > 0 && (
              <div className="mb-2 rounded-xl border bg-background p-2">
                <div className="mb-1 px-1 text-[11px] text-muted-foreground">Commands</div>
                <div className="flex flex-col gap-1">
                  {filteredSlashCommands.map((item) => (
                    <button
                      key={item.cmd}
                      type="button"
                      onClick={() => sendText(item.cmd)}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="font-mono">{item.cmd}</span>
                      <span className="text-muted-foreground">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* @mention autocomplete popup */}
            {showMentionPopup && (
              <div
                ref={mentionPopupRef}
                className="mb-2 rounded-xl border bg-background shadow-lg overflow-hidden"
              >
                <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground font-medium">Members</div>
                {filteredMentionMembers.map((member, idx) => (
                  <button
                    key={member.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(member.id); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                      idx === mentionActiveIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs flex-shrink-0">
                      {agentEmoji(member)}
                    </span>
                    <span className="font-medium truncate">{agentLabel(member)}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto flex-shrink-0">@{member.id}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border bg-background px-4 py-2.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder={inputPlaceholder}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none max-h-[120px] leading-relaxed py-0.5"
              />
              <button type="button" onClick={onSend} disabled={sending || !input.trim()} className="flex-shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40 transition-opacity">
                {sending ? '…' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground/40">
              {selectedGroup
                ? 'Shift+Enter for new line · Type @ to mention a member'
                : 'Shift+Enter for new line'}
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

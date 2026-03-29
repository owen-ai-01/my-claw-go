'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ModelSelect } from '@/components/ui/model-select';
import { AgentAvatarPicker } from './agent-avatar-picker';
import type { AgentRecord } from './types';

type AgentsResponse = {
  ok?: boolean;
  data?: {
    defaultAgentId?: string;
    agents?: AgentRecord[];
  };
};

type CreateAgentPayload = {
  agentId: string;
  name?: string;
  role?: string;
  description?: string;
  department?: string;
  model?: string;
  avatar?: string;
  emoji?: string;
};

type CreateAgentResponse = {
  ok?: boolean;
  data?: AgentRecord;
  error?: string;
};

type DeleteAgentResponse = {
  ok?: boolean;
  data?: { deleted?: boolean };
  error?: string;
};

const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$|^[a-z0-9]{2,30}$/;

function agentLabel(agent: AgentRecord) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentRecord) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('/avatars/agents/robot-main.svg');
  const [emoji, setEmoji] = useState('🤖');
  const [model, setModel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  const idValid = AGENT_ID_RE.test(agentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idValid) return;
    setSubmitting(true);
    setError('');
    try {
      const body: CreateAgentPayload = { agentId: agentId.trim() };
      if (name.trim()) body.name = name.trim();
      if (role.trim()) body.role = role.trim();
      if (department.trim()) body.department = department.trim();
      if (description.trim()) body.description = description.trim();
      if (avatar.trim()) body.avatar = avatar.trim();
      if (emoji.trim()) body.emoji = emoji.trim();
      if (model.trim()) body.model = model.trim();
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as CreateAgentResponse;
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || 'Failed to create agent');
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create New Agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Agent ID <span className="text-red-500">*</span>
            </label>
            <input
              ref={idRef}
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="e.g. sales-bot"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
            {agentId && !idValid && (
              <p className="mt-1 text-xs text-red-500">
                ID must be 2–32 chars, lowercase letters, numbers, hyphens or underscores.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Bot"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Role (optional)</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. SEO strategist"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Department (optional)</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Marketing"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Avatar</label>
            <AgentAvatarPicker value={avatar} onChange={setAvatar} onEmojiChange={setEmoji} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Bio (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief intro for this agent..."
              rows={3}
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Model (optional)</label>
            <ModelSelect value={model} onChange={setModel} placeholder="Default model" selectClassName="bg-muted/30" inputClassName="bg-muted/30" />
            <p className="mt-1 text-xs text-muted-foreground">Search and choose model, or leave blank to use default.</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!idValid || submitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ agent, onClose, onDeleted }: { agent: AgentRecord; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as DeleteAgentResponse;
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Failed to delete');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Delete Agent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to delete <strong>{agentLabel(agent)}</strong>?
          This will remove all workspace data for this agent and cannot be undone.
        </p>
        {error && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsOverview() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentRecord | null>(null);

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as AgentsResponse;
      if (!res.ok || data.ok !== true) throw new Error('Failed to load agents');
      setAgents(data.data?.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={loadAgents}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          agent={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={loadAgents}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage your AI employees, inspect their current setup, and configure channels like Telegram.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + New Agent
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">Loading agents…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
          <div className="mb-3 text-4xl">🤖</div>
          <h3 className="text-base font-semibold">No agents yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Click <strong>+ New Agent</strong> to create your first AI employee.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-primary/10">
                      {agent.identity?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={agent.identity.avatar} alt={agentLabel(agent)} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base">{agentEmoji(agent)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{agentLabel(agent)}</h2>
                        {agent.isDefault ? (
                          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Default</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">@{agent.id}</p>
                    </div>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${agent.enabled === false ? 'bg-gray-200 text-gray-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  {agent.enabled === false ? 'disabled' : 'active'}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Role</p>
                  <p className="mt-1 truncate text-sm font-medium">{agent.role || '—'}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="mt-1 truncate text-sm font-medium">{agent.department || '—'}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="mt-1 truncate text-sm font-medium">{agent.model || 'Default'}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Telegram</p>
                  <p className="mt-1 text-sm font-medium">
                    {agent.telegram?.hasBotToken
                      ? agent.telegram.bindingEnabled
                        ? 'Connected'
                        : 'Configured'
                      : 'Not set up'}
                  </p>
                </div>
              </div>

              {agent.description ? (
                <div className="mt-3 rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm font-medium text-foreground/80">{agent.description}</p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/settings/agents/${encodeURIComponent(agent.id)}`}
                  className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Open
                </Link>
                {!agent.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(agent)}
                    className="rounded-lg border border-red-200 px-3.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

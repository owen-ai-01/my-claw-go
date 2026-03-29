'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Routes } from '@/routes';
import { ModelSelect } from '@/components/ui/model-select';
import { AgentAvatarPicker } from '@/components/settings/agents/agent-avatar-picker';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  } | null;
};

type AgentStatus = {
  agentId: string;
  online: boolean;
  lastActivity: string | null;
  currentTask: { id?: string; description?: string; status?: string } | null;
  recentErrors: string[];
};

type TaskItem = {
  id: string;
  name?: string;
  enabled?: boolean;
  updatedAtMs?: number;
  createdAtMs?: number;
  state?: {
    nextRunAtMs?: number;
  };
};

type TaskRun = {
  status?: 'ok' | 'error';
  startedAtMs?: number;
  finishedAtMs?: number;
  error?: string;
  reply?: string;
};

type EnrichedAgent = AgentItem & {
  statusData: AgentStatus | null;
  statusLoading: boolean;
  tasksData?: TaskItem[];
  latestTaskRun?: TaskRun | null;
};

type PresenceCategory = 'busy' | 'online' | 'idle' | 'offline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agentLabel(agent: Partial<AgentItem>) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id || 'Agent';
}

function agentEmoji(agent: Partial<AgentItem>) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function relativeTimeMs(ms?: number | null): string {
  if (!ms) return 'Never';
  return relativeTime(new Date(ms).toISOString());
}

function resolvePresence(agent: EnrichedAgent): PresenceCategory {
  const s = agent.statusData;
  if (!s) return 'offline';
  if (s.currentTask) return 'busy';
  if (!s.online) return 'offline';
  if (s.lastActivity) {
    const ageMs = Date.now() - new Date(s.lastActivity).getTime();
    if (ageMs < 5 * 60 * 1000) return 'online';
  }
  return 'idle';
}

function presenceLabel(p: PresenceCategory) {
  return { busy: 'Busy', online: 'Online', idle: 'Idle', offline: 'Offline' }[p];
}

function presenceColors(p: PresenceCategory) {
  return {
    busy: {
      badge: 'bg-blue-100 text-blue-700 border-blue-300',
      dot: 'bg-blue-500',
      border: 'border-blue-200',
      ring: 'ring-1 ring-blue-200',
    },
    online: {
      badge: 'bg-green-100 text-green-700 border-green-300',
      dot: 'bg-green-500',
      border: 'border-green-200',
      ring: 'ring-1 ring-green-200',
    },
    idle: {
      badge: 'bg-gray-100 text-gray-600 border-gray-200',
      dot: 'bg-gray-400',
      border: 'border-border',
      ring: '',
    },
    offline: {
      badge: 'bg-gray-100 text-gray-400 border-gray-200',
      dot: 'bg-gray-300',
      border: 'border-border',
      ring: '',
    },
  }[p];
}

// ─── Create Agent Modal ───────────────────────────────────────────────────────

const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,29}[a-z0-9]$|^[a-z0-9]{2,30}$/;

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('/avatars/agents/robot-main.svg');
  const [emoji, setEmoji] = useState('🤖');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => { idRef.current?.focus(); }, []);

  const idValid = AGENT_ID_RE.test(agentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idValid) return;
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, string> = { agentId: agentId.trim() };
      if (name.trim()) body.name = name.trim();
      if (role.trim()) body.role = role.trim();
      if (description.trim()) body.description = description.trim();
      if (avatar.trim()) body.avatar = avatar.trim();
      if (emoji.trim()) body.emoji = emoji.trim();
      if (model.trim()) body.model = model.trim();
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Failed to create agent');
      setAgentId('');
      setName('');
      setRole('');
      setDescription('');
      setAvatar('/avatars/agents/robot-main.svg');
      setEmoji('🤖');
      setModel('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add New Agent</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Agent ID <span className="text-red-500">*</span></label>
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
              <p className="mt-1 text-xs text-red-500">2–32 chars, lowercase letters / numbers / hyphens / underscores.</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Bot"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Role (optional)</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Product Manager"
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Bio (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief intro for this agent..."
              rows={3}
              className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Avatar</label>
            <AgentAvatarPicker value={avatar} onChange={setAvatar} onEmojiChange={setEmoji} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Model (optional)</label>
            <ModelSelect value={model} onChange={setModel} placeholder="Default model" selectClassName="bg-muted/30" inputClassName="bg-muted/30" />
          </div>
          {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={!idValid || submitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: EnrichedAgent }) {
  const router = useRouter();
  const presence = resolvePresence(agent);
  const colors = presenceColors(presence);
  const s = agent.statusData;
  const hasErrors = (s?.recentErrors?.length ?? 0) > 0;
  const hasTaskFailure = agent.latestTaskRun?.status === 'error';

  return (
    <div className={`group relative rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${hasTaskFailure ? 'border-red-300 ring-1 ring-red-200 bg-red-50/30' : colors.ring}`}>
      {/* Error indicator */}
      {(hasErrors || hasTaskFailure) && (
        <div className="absolute right-3 top-3">
          <span className="flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="h-14 w-14 overflow-hidden rounded-full bg-primary/10">
            {agent.identity?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agent.identity.avatar} alt={agentLabel(agent)} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">{agentEmoji(agent)}</div>
            )}
          </div>
          {/* Online dot */}
          <span className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${colors.dot}`} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{agentLabel(agent)}</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">@{agent.id}</p>
              {agent.role ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{agent.role}</p> : null}
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
              {presenceLabel(presence)}
            </span>
          </div>

          {/* Status details */}
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {/* Current task */}
            {s?.currentTask ? (
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">⚙️</span>
                <span className="line-clamp-2">{s.currentTask.description || `Task ${s.currentTask.id || ''} running…`}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span>🕐</span>
                <span>Last active: {relativeTime(s?.lastActivity)}</span>
              </div>
            )}

            {/* Model */}
            {agent.model && (
              <div className="flex items-center gap-1.5">
                <span>🤖</span>
                <span className="truncate font-mono text-[10px] opacity-70">{agent.model}</span>
              </div>
            )}

            {/* Telegram */}
            {agent.telegram ? (
              <div className="flex items-center gap-1.5">
                <span>💬</span>
                <span>
                  {agent.telegram.bindingEnabled
                    ? 'Telegram connected'
                    : agent.telegram.hasBotToken
                    ? 'Telegram configured (not bound)'
                    : 'Telegram not set up'}
                </span>
              </div>
            ) : null}

            {/* Task summary */}
            <div className="flex items-center gap-1.5">
              <span>🗂️</span>
              <span>
                {agent.tasksData?.length ? `${agent.tasksData.filter((t) => t.enabled !== false).length}/${agent.tasksData.length} tasks enabled` : 'No tasks yet'}
              </span>
            </div>
            {agent.tasksData?.find((task) => task.enabled !== false && task.state?.nextRunAtMs) ? (
              <div className="flex items-center gap-1.5">
                <span>⏭️</span>
                <span>
                  Next run: {relativeTimeMs(
                    [...agent.tasksData]
                      .filter((task) => task.enabled !== false && task.state?.nextRunAtMs)
                      .sort((a, b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0))[0]?.state?.nextRunAtMs
                  )}
                </span>
              </div>
            ) : null}
            {agent.latestTaskRun ? (
              <div className={`flex items-start gap-1.5 ${agent.latestTaskRun.status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
                <span className="mt-0.5 shrink-0">{agent.latestTaskRun.status === 'error' ? '⚠️' : '✅'}</span>
                <span className="line-clamp-2">
                  Last task run {agent.latestTaskRun.status === 'error' ? 'failed' : 'succeeded'} {relativeTimeMs(agent.latestTaskRun.finishedAtMs || agent.latestTaskRun.startedAtMs)}
                </span>
              </div>
            ) : null}
            {hasTaskFailure && agent.latestTaskRun?.error ? (
              <div className="flex items-start gap-1.5 text-red-700">
                <span className="mt-0.5 shrink-0">🧾</span>
                <span className="line-clamp-2">Failure: {agent.latestTaskRun.error}</span>
              </div>
            ) : null}

            {/* Recent errors */}
            {hasErrors && (
              <div className="flex items-start gap-1.5 text-red-600">
                <span className="mt-0.5 shrink-0">⚠️</span>
                <span className="line-clamp-1">{s!.recentErrors[0]}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(`${Routes.Chat}?agentId=${encodeURIComponent(agent.id)}`)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => router.push(`${Routes.SettingsAgents}/${agent.id}`)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              Configure
            </button>
            <button
              type="button"
              onClick={() => router.push(`${Routes.SettingsAgents}/${agent.id}`)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              Tasks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function OfficeShell() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<EnrichedAgent[]>([]);
  const [dialogAgentId, setDialogAgentId] = useState<string>('main');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const refreshInterval = 15;

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean;
        data?: { agents?: AgentItem[]; defaultAgentId?: string };
      };
      if (!data.ok || !data.data?.agents) throw new Error('Failed to load agents');

      const preferredDialogAgentId =
        searchParams.get('agentId') ||
        data.data.defaultAgentId ||
        data.data.agents.find((a) => a.isDefault)?.id ||
        data.data.agents[0]?.id ||
        'main';
      setDialogAgentId(preferredDialogAgentId);

      const base = data.data.agents.map<EnrichedAgent>((a) => ({ 
        ...a,
        statusData: null,
        statusLoading: true,
        tasksData: [],
        latestTaskRun: null,
      }));
      setAgents(base);
      setError(null);

      // Fetch status for each agent in parallel
      const enriched = await Promise.all(
        base.map(async (agent) => {
          try {
            const [sr, tr] = await Promise.all([
              fetch(`/api/agents/${encodeURIComponent(agent.id)}/status`, { cache: 'no-store' }),
              fetch(`/api/agents/${encodeURIComponent(agent.id)}/tasks`, { cache: 'no-store' }),
            ]);
            const sd = await sr.json().catch(() => ({})) as { ok?: boolean; data?: { status?: AgentStatus } };
            const td = await tr.json().catch(() => ({})) as { ok?: boolean; data?: { jobs?: TaskItem[] } };
            const tasksData = td.ok && td.data?.jobs ? td.data.jobs : [];

            let latestTaskRun: TaskRun | null = null;
            if (tasksData.length > 0) {
              const runResults = await Promise.all(
                tasksData.slice(0, 5).map(async (task) => {
                  try {
                    const rr = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/tasks/${encodeURIComponent(task.id)}/runs?limit=1`, { cache: 'no-store' });
                    const rd = await rr.json().catch(() => ({})) as { ok?: boolean; data?: { runs?: TaskRun[] } };
                    return Array.isArray(rd.data?.runs) ? rd.data?.runs?.[0] || null : null;
                  } catch {
                    return null;
                  }
                })
              );
              latestTaskRun = runResults
                .filter(Boolean)
                .sort((a, b) => ((b?.finishedAtMs || b?.startedAtMs || 0) - (a?.finishedAtMs || a?.startedAtMs || 0)))[0] || null;
            }

            return { ...agent, statusData: sd.data?.status ?? null, statusLoading: false, tasksData, latestTaskRun };
          } catch {
            return { ...agent, statusData: null, statusLoading: false, tasksData: [], latestTaskRun: null };
          }
        })
      );
      setAgents(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, [searchParams]);

  // Auto-refresh every 15s with countdown
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadAgents();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const dialogAgent = agents.find((a) => a.id === dialogAgentId) || agents[0] || null;
  const nonDialogAgents = agents.filter((a) => a.id !== dialogAgent?.id);
  const officeAgents = nonDialogAgents.filter((a) => resolvePresence(a) === 'busy');
  const loungeAgents = nonDialogAgents.filter((a) => resolvePresence(a) !== 'busy');


  return (
    <div className="flex flex-col gap-6">
      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { loadAgents(); setCountdown(refreshInterval); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Office</h1>
          <p className="mt-1 text-sm text-muted-foreground">Left: Dialogue / Office / Lounge · Right: reserved area</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { loadAgents(); setCountdown(refreshInterval); }}
            disabled={loading}
            className="rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? 'Loading…' : `Refresh (${countdown}s)`}
          </button>
        </div>
      </div>


      {/* Content */}
      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-10">
          <div className="lg:col-span-7 h-64 animate-pulse rounded-2xl border bg-muted/40" />
          <div className="lg:col-span-3 h-64 animate-pulse rounded-2xl border bg-muted/40" />
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
          <div className="mb-3 text-4xl">👥</div>
          <h3 className="text-base font-semibold">No agents yet</h3>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-10">
          <div className="space-y-6 lg:col-span-7">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-purple-700">💬 对话区 {dialogAgent ? '(1)' : '(0)'}</h2>
              {dialogAgent ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  <AgentCard key={dialogAgent.id} agent={dialogAgent} />
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agent in dialogue zone.</div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-blue-700">⚙️ 办公区 ({officeAgents.length})</h2>
              {officeAgents.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  {officeAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agents are working right now.</div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-600">🛋️ 休闲区 ({loungeAgents.length})</h2>
              {loungeAgents.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  {loungeAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agents in lounge zone.</div>
              )}
            </section>
          </div>

          <aside className="lg:col-span-3 rounded-2xl border bg-card/50 p-4 min-h-[360px]" />
        </div>
      )}
    </div>
  );
}

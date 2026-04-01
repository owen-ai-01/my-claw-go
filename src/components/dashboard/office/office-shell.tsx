'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
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

function timeLabel(ts?: number | string | null) {
  if (!ts) return '--:--';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
            <label className="mb-1.5 block text-sm font-medium">Description (optional)</label>
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

function AgentCard({ agent, zone, moved }: { agent: EnrichedAgent; zone: 'dialogue' | 'office' | 'lounge'; moved?: boolean }) {
  const s = agent.statusData;
  const progressText =
    zone === 'dialogue'
      ? s?.currentTask?.description || 'In conversation'
      : s?.currentTask?.description || 'Working on task';

  return (
    <motion.div
      layout
      layoutId={`office-agent-${agent.id}`}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className={`rounded-2xl border bg-card p-4 shadow-sm transition-all duration-500 ${moved ? 'ring-2 ring-primary/40 scale-[1.02]' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-primary/10">
          {agent.identity?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.identity.avatar} alt={agentLabel(agent)} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl">{agentEmoji(agent)}</div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{agentLabel(agent)}</h3>
          <p className="truncate text-xs text-muted-foreground">@{agent.id}</p>
        </div>
      </div>

      {zone !== 'lounge' && (
        <div className="mt-3 space-y-1.5">
          <div className="text-xs text-muted-foreground line-clamp-1">{progressText}</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${zone === 'dialogue' ? 'w-2/3 bg-purple-500' : 'w-5/6 bg-blue-500'} animate-pulse`} />
          </div>
        </div>
      )}
    </motion.div>
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
  const [countdown, setCountdown] = useState(5);
  const [rightTab, setRightTab] = useState<'live' | 'tasks'>('live');
  const [movedAt, setMovedAt] = useState<Record<string, number>>({});
  const [liveFeed, setLiveFeed] = useState<Array<{ key: string; at: number; agentId: string; agentName: string; action: string }>>([]);
  const liveFeedSeenRef = useRef<Set<string>>(new Set());
  const prevZonesRef = useRef<Record<string, 'dialogue' | 'office' | 'lounge'>>({});
  const refreshInterval = 5;

  async function loadAgents() {
    try {
      const [res, activeRes] = await Promise.all([
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/chat/active-agent', { cache: 'no-store' }),
      ]);
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean;
        data?: { agents?: AgentItem[]; defaultAgentId?: string };
      };
      const activeData = await activeRes.json().catch(() => ({})) as { ok?: boolean; data?: { agentId?: string } };
      if (!data.ok || !data.data?.agents) throw new Error('Failed to load agents');

      const explicitDialogAgentId = activeData.data?.agentId || searchParams.get('agentId') || '';
      setDialogAgentId(explicitDialogAgentId);

      const base = data.data.agents.map<EnrichedAgent>((a) => ({ 
        ...a,
        statusData: null,
        statusLoading: true,
        tasksData: [],
        latestTaskRun: null,
      }));
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

  // Realtime: sync active dialogue agent from chat page
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/chat/active-agent', { cache: 'no-store' });
        const data = await res.json().catch(() => ({})) as { ok?: boolean; data?: { agentId?: string } };
        if (data?.ok) {
          setDialogAgentId(data.data?.agentId || '');
        }
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh agent status every 5s with countdown
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

  const dialogAgent = dialogAgentId ? (agents.find((a) => a.id === dialogAgentId) || null) : null;
  const nonDialogAgents = agents.filter((a) => a.id !== dialogAgent?.id);
  const officeAgents = nonDialogAgents.filter((a) => resolvePresence(a) === 'busy');
  const loungeAgents = nonDialogAgents.filter((a) => resolvePresence(a) !== 'busy');

  const zoneByAgent: Record<string, 'dialogue' | 'office' | 'lounge'> = {};
  if (dialogAgent) zoneByAgent[dialogAgent.id] = 'dialogue';
  for (const a of officeAgents) zoneByAgent[a.id] = 'office';
  for (const a of loungeAgents) zoneByAgent[a.id] = 'lounge';

  useEffect(() => {
    const prevZones = prevZonesRef.current;
    const now = Date.now();
    const changed: Record<string, number> = {};
    for (const [id, zone] of Object.entries(zoneByAgent)) {
      const before = prevZones[id];
      if (before && before !== zone) changed[id] = now;
    }
    prevZonesRef.current = zoneByAgent;
    if (Object.keys(changed).length > 0) {
      setMovedAt((prev) => ({ ...prev, ...changed }));
    }
  }, [zoneByAgent, dialogAgentId]);

  useEffect(() => {
    const newItems: Array<{ key: string; at: number; agentId: string; agentName: string; action: string }> = [];
    for (const agent of agents) {
      if (agent.statusData?.currentTask?.description) {
        const key = `${agent.id}:task:${agent.statusData.currentTask.description}`;
        if (!liveFeedSeenRef.current.has(key)) {
          liveFeedSeenRef.current.add(key);
          newItems.push({
            key,
            at: Date.now(),
            agentId: agent.id,
            agentName: agentLabel(agent),
            action: agent.statusData.currentTask.description,
          });
        }
      }
      if (agent.latestTaskRun?.startedAtMs) {
        const key = `${agent.id}:run:${agent.latestTaskRun.startedAtMs}:${agent.latestTaskRun.status || 'ok'}`;
        if (!liveFeedSeenRef.current.has(key)) {
          liveFeedSeenRef.current.add(key);
          newItems.push({
            key,
            at: agent.latestTaskRun.startedAtMs,
            agentId: agent.id,
            agentName: agentLabel(agent),
            action: agent.latestTaskRun.status === 'error' ? 'Task run failed' : 'Task run finished',
          });
        }
      }
    }
    if (newItems.length > 0) {
      setLiveFeed((prev) => [...newItems.sort((a, b) => b.at - a.at), ...prev].slice(0, 120));
    }
  }, [agents]);

  // Structured activity stream from bridge
  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch('/api/activity/recent?limit=160', { cache: 'no-store' });
        const json = await res.json().catch(() => ({})) as {
          ok?: boolean;
          data?: {
            events?: Array<{ at?: number; agentId?: string; action?: string }>;
          };
        };
        const events = Array.isArray(json?.data?.events) ? json.data!.events! : [];
        if (events.length === 0) return;

        const newItems: Array<{ key: string; at: number; agentId: string; agentName: string; action: string }> = [];

        for (const ev of events) {
          const agentId = String(ev.agentId || '').trim();
          const action = String(ev.action || '').trim();
          const at = Number(ev.at || Date.now());
          if (!agentId || !action) continue;

          const key = `act:${agentId}:${at}:${action}`;
          if (liveFeedSeenRef.current.has(key)) continue;
          liveFeedSeenRef.current.add(key);

          const agent = agents.find((a) => a.id === agentId);
          newItems.push({
            key,
            at,
            agentId,
            agentName: agent ? agentLabel(agent) : agentId,
            action,
          });
        }

        if (!stopped && newItems.length > 0) {
          setLiveFeed((prev) => [...newItems.sort((a, b) => b.at - a.at), ...prev].slice(0, 120));
        }
      } catch {
        // ignore activity polling failures
      }
    };

    tick();
    const timer = setInterval(tick, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [agents]);

  const liveRows = liveFeed.slice(0, 14);

  const taskRows = agents
    .flatMap((agent) =>
      (agent.tasksData || [])
        .filter((t) => t.enabled !== false)
        .map((t) => ({
          at: t.state?.nextRunAtMs || t.updatedAtMs || t.createdAtMs || 0,
          agentId: agent.id,
          agentName: agentLabel(agent),
          taskName: t.name || t.id,
          nextRunAtMs: t.state?.nextRunAtMs,
        }))
    )
    .sort((a, b) => (a.nextRunAtMs || a.at) - (b.nextRunAtMs || b.at))
    .slice(0, 20);

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
          <LayoutGroup id="office-zones">
            <div className="space-y-6 lg:col-span-7">
              <section>
                <h2 className="mb-3 text-sm font-semibold text-purple-700">💬 对话区 {dialogAgent ? '(1)' : '(0)'}</h2>
                {dialogAgent ? (
                  <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={`dialogue-${dialogAgent.id}`}
                        layout
                        initial={{ opacity: 0, y: -14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 14, scale: 0.98 }}
                        transition={{ duration: 0.28 }}
                      >
                        <AgentCard agent={dialogAgent} zone="dialogue" moved={Date.now() - (movedAt[dialogAgent.id] || 0) < 2000} />
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agent in dialogue zone.</div>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-blue-700">⚙️ 办公区 ({officeAgents.length})</h2>
                {officeAgents.length > 0 ? (
                  <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {officeAgents.map((a) => (
                        <motion.div
                          key={`office-${a.id}`}
                          layout
                          initial={{ opacity: 0, x: 18, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -18, scale: 0.98 }}
                          transition={{ duration: 0.28 }}
                        >
                          <AgentCard agent={a} zone="office" moved={Date.now() - (movedAt[a.id] || 0) < 2000} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agents are working right now.</div>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-gray-600">🛋️ 休闲区 ({loungeAgents.length})</h2>
                {loungeAgents.length > 0 ? (
                  <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {loungeAgents.map((a) => (
                        <motion.div
                          key={`lounge-${a.id}`}
                          layout
                          initial={{ opacity: 0, y: 14, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -14, scale: 0.98 }}
                          transition={{ duration: 0.28 }}
                        >
                          <AgentCard agent={a} zone="lounge" moved={Date.now() - (movedAt[a.id] || 0) < 2000} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No agents in lounge zone.</div>
                )}
              </section>
            </div>
          </LayoutGroup>

          <aside className="lg:col-span-3 rounded-2xl border bg-card/50 p-4 min-h-[360px]">
            <div className="mb-3 flex items-center gap-2 rounded-xl border bg-background p-1">
              <button
                type="button"
                onClick={() => setRightTab('live')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${rightTab === 'live' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Live Feed
              </button>
              <button
                type="button"
                onClick={() => setRightTab('tasks')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${rightTab === 'tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Scheduled Tasks
              </button>
            </div>

            {rightTab === 'live' ? (
              <div className="space-y-2">
                {liveRows.length === 0 ? (
                  <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">No recent activity.</div>
                ) : (
                  liveRows.map((row, idx) => (
                    <div key={`${row.agentId}-${row.at}-${idx}`} className="rounded-lg border bg-background px-3 py-2">
                      <div className="grid grid-cols-[56px_1fr] gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{timeLabel(row.at)}</span>
                        <span className="truncate"><strong>{row.agentName}</strong> · {row.action}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {taskRows.length === 0 ? (
                  <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">No scheduled tasks.</div>
                ) : (
                  taskRows.map((row, idx) => (
                    <div key={`${row.agentId}-${row.taskName}-${idx}`} className="rounded-lg border bg-background px-3 py-2">
                      <div className="grid grid-cols-[56px_1fr] gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{timeLabel(row.nextRunAtMs || row.at)}</span>
                        <span className="truncate"><strong>{row.agentName}</strong> · {row.taskName}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

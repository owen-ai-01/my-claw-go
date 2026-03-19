'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Routes } from '@/routes';

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
  } | null;
};

type AgentsResponse = {
  ok?: boolean;
  data?: {
    defaultAgentId?: string;
    agents?: AgentItem[];
  };
};

type AgentStatus = 'online' | 'idle' | 'busy' | 'offline' | 'error';

type AgentWithStatus = AgentItem & {
  status: AgentStatus;
  statusText: string;
  lastActivity?: string;
};

function agentLabel(agent: Partial<AgentItem>) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id || 'Agent';
}

function agentEmoji(agent: Partial<AgentItem>) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function getAgentStatus(agent: AgentItem): { status: AgentStatus; statusText: string } {
  // 简化版状态判断逻辑
  // 第一版只判断基本状态，后续可以扩展
  
  if (agent.telegram?.enabled && agent.telegram?.hasBotToken && agent.telegram?.bindingEnabled) {
    return { status: 'online', statusText: 'Online - Telegram connected' };
  }
  
  if (agent.telegram?.enabled && agent.telegram?.hasBotToken) {
    return { status: 'idle', statusText: 'Idle - Telegram configured but not bound' };
  }

  return { status: 'idle', statusText: 'Idle - Ready to work' };
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const colors = {
    online: 'bg-green-100 text-green-700 border-green-300',
    idle: 'bg-gray-100 text-gray-700 border-gray-300',
    busy: 'bg-blue-100 text-blue-700 border-blue-300',
    offline: 'bg-gray-100 text-gray-500 border-gray-300',
    error: 'bg-red-100 text-red-700 border-red-300',
  };

  const labels = {
    online: 'Online',
    idle: 'Idle',
    busy: 'Busy',
    offline: 'Offline',
    error: 'Error',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {labels[status]}
    </span>
  );
}

function AgentCard({ agent }: { agent: AgentWithStatus }) {
  const router = useRouter();

  return (
    <div className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl">
          {agentEmoji(agent)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{agentLabel(agent)}</h3>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">@{agent.id}</p>
            </div>
            <StatusBadge status={agent.status} />
          </div>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">📊</span>
              <span className="truncate">{agent.statusText}</span>
            </div>

            {agent.model && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">🤖</span>
                <span className="truncate text-xs">{agent.model}</span>
              </div>
            )}

            {agent.telegram?.enabled && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">💬</span>
                <span className="text-xs">Telegram {agent.telegram.bindingEnabled ? 'active' : 'configured'}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(Routes.Chat)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
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
          </div>
        </div>
      </div>
    </div>
  );
}

export function OfficeShell() {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 10000); // 每10秒刷新
    return () => clearInterval(interval);
  }, []);

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as AgentsResponse;
      
      if (data.ok && data.data?.agents?.length) {
        const agentsWithStatus = data.data.agents.map((agent) => ({
          ...agent,
          ...getAgentStatus(agent),
        }));
        setAgents(agentsWithStatus);
        setError(null);
      } else {
        setAgents([]);
        setError('No agents found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  const onlineAgents = agents.filter((a) => a.status === 'online');
  const busyAgents = agents.filter((a) => a.status === 'busy');
  const idleAgents = agents.filter((a) => a.status === 'idle');
  const offlineAgents = agents.filter((a) => a.status === 'offline' || a.status === 'error');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Office</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI team at a glance - see who's working, what they're doing, and their current status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
          </div>
          <button
            type="button"
            onClick={loadAgents}
            disabled={loading}
            className="rounded-lg border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading agents...
        </div>
      ) : (
        <div className="space-y-6">
          {onlineAgents.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-green-700">
                🟢 Online ({onlineAgents.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {onlineAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {busyAgents.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-blue-700">
                🔵 Busy ({busyAgents.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {busyAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {idleAgents.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                ⚪ Idle ({idleAgents.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {idleAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {offlineAgents.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-500">
                ⚫ Offline / Error ({offlineAgents.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {offlineAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {agents.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <div className="mb-4 text-4xl">👥</div>
              <h3 className="text-lg font-semibold">No agents yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first AI employee to get started.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

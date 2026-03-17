'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AgentRecord } from './types';

type AgentsResponse = {
  ok?: boolean;
  data?: {
    defaultAgentId?: string;
    agents?: AgentRecord[];
  };
};

function agentLabel(agent: AgentRecord) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentRecord) {
  return agent.identity?.emoji?.trim() || '🤖';
}

export function AgentsOverview() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as AgentsResponse;
        if (!res.ok || data.ok !== true) {
          throw new Error('Failed to load agents');
        }
        setAgents(data.data?.agents || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Manage your AI employees, inspect their current setup, and prepare channel bindings like Telegram.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">Loading agents…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-base">
                      {agentEmoji(agent)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{agentLabel(agent)}</h2>
                        {agent.isDefault ? (
                          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Default</span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">@{agent.id}</p>
                    </div>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                  active
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="mt-1 truncate text-sm font-medium">{agent.model || 'Use default'}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Telegram</p>
                  <p className="mt-1 text-sm font-medium">
                    {agent.telegram?.hasBotToken ? (agent.telegram.bindingEnabled ? 'Configured + routed' : 'Configured') : 'Not configured'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/settings/agents/${encodeURIComponent(agent.id)}`}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Open Agent
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

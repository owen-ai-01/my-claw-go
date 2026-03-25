'use client';

import Link from 'next/link';
import { Routes } from '@/routes';
import { useEffect, useState } from 'react';
import type { AgentDetailRecord } from './types';

type AgentResponse = {
  ok?: boolean;
  data?: AgentDetailRecord;
};

type AgentsMdResponse = {
  ok?: boolean;
  data?: {
    agentId: string;
    path: string;
    content: string;
  };
};

function agentLabel(agent: AgentDetailRecord) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentDetailRecord) {
  return agent.identity?.emoji?.trim() || '🤖';
}

export function AgentDetails({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentDetailRecord | null>(null);
  const [agentsMd, setAgentsMd] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [agentRes, agentsMdRes] = await Promise.all([
          fetch(`/api/agents/${encodeURIComponent(agentId)}`, { cache: 'no-store' }),
          fetch(`/api/agents/${encodeURIComponent(agentId)}/agents-md`, { cache: 'no-store' }),
        ]);

        const agentData = (await agentRes.json().catch(() => ({}))) as AgentResponse;
        if (!agentRes.ok || agentData.ok !== true || !agentData.data) {
          throw new Error('Failed to load agent details');
        }
        setAgent(agentData.data);

        if (agentsMdRes.ok) {
          const agentsMdData = (await agentsMdRes.json().catch(() => ({}))) as AgentsMdResponse;
          if (agentsMdData.ok === true && agentsMdData.data?.content) {
            setAgentsMd(agentsMdData.data.content);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  if (loading) {
    return <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">Loading agent…</div>;
  }

  if (error || !agent) {
    return <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error || 'Agent not found'}</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg">
              {agentEmoji(agent)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{agentLabel(agent)}</h1>
                {agent.isDefault ? (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Default</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">@{agent.id}</p>
            </div>
          </div>
        </div>
        <Link href={Routes.Chat} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
          Back to Chat
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">AGENTS.md</h2>
            <p className="mt-1 text-sm text-muted-foreground">Phase 1 currently reads each agent’s core config from its own workspace AGENTS.md.</p>
          </div>
          <textarea
            value={agentsMd}
            readOnly
            className="min-h-[420px] w-full resize-none rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-6 text-foreground outline-none"
          />
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Agent Basics</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="mt-1 break-all font-medium">{agent.role || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Department</dt>
                <dd className="mt-1 break-all font-medium">{agent.department || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="mt-1 break-all font-medium">{agent.description || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Enabled</dt>
                <dd className="mt-1 break-all font-medium">{agent.enabled === false ? 'No' : 'Yes'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Model</dt>
                <dd className="mt-1 break-all font-medium">{agent.model || 'Use default'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Workspace</dt>
                <dd className="mt-1 break-all font-medium">{agent.workspace || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">AGENTS.md Path</dt>
                <dd className="mt-1 break-all font-medium">{agent.agentsMdPath || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identity Theme</dt>
                <dd className="mt-1 break-all font-medium">{agent.identity?.theme || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Telegram</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Account ID</dt>
                <dd className="mt-1 font-medium">{agent.telegram?.accountId || agent.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Token</dt>
                <dd className="mt-1 font-medium">{agent.telegram?.hasBotToken ? 'Configured' : 'Not configured'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Binding</dt>
                <dd className="mt-1 font-medium">{agent.telegram?.bindingEnabled ? 'Connected to this agent' : 'Not routed yet'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Enabled</dt>
                <dd className="mt-1 font-medium">{agent.telegram ? (agent.telegram.enabled ? 'Yes' : 'No') : 'No'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Editing Telegram settings will be the next step. This page is currently read-only for validation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

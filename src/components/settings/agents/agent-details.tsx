'use client';

import Link from 'next/link';
import { Routes } from '@/routes';
import { useEffect, useState } from 'react';
import { ModelSelect } from '@/components/ui/model-select';
import type { AgentDetailRecord } from './types';

type AgentResponse = {
  ok?: boolean;
  data?: AgentDetailRecord;
};

type AgentDocResponse = {
  ok?: boolean;
  data?: {
    agentId: string;
    docKey?: string;
    path: string;
    content: string;
  };
};

type TaskItem = {
  id: string;
  name?: string;
  enabled?: boolean;
  updatedAtMs?: number;
  createdAtMs?: number;
  schedule?: {
    kind?: 'every' | 'cron' | 'at';
    everyMs?: number;
    expr?: string;
    at?: string;
  };
  payload?: {
    message?: string;
    text?: string;
    model?: string;
  };
  state?: {
    nextRunAtMs?: number;
  };
};

function agentLabel(agent: AgentDetailRecord) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentDetailRecord) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function formatSchedule(task: TaskItem) {
  if (task.schedule?.kind === 'every' && task.schedule.everyMs) {
    const ms = task.schedule.everyMs;
    if (ms % 3600000 === 0) return `Every ${ms / 3600000}h`;
    if (ms % 60000 === 0) return `Every ${ms / 60000}m`;
    return `Every ${Math.round(ms / 1000)}s`;
  }
  if (task.schedule?.kind === 'cron') return task.schedule.expr || 'Cron';
  if (task.schedule?.kind === 'at') return task.schedule.at || 'One-time';
  return 'Unknown';
}

function formatDateTime(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function AgentTasksPanel({ agentId }: { agentId: string }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] = useState<'every' | 'cron' | 'at'>('every');
  const [scheduleValue, setScheduleValue] = useState('1h');
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [runsText, setRunsText] = useState('');

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; data?: { jobs?: TaskItem[] }; error?: string | { message?: string } };
      if (!res.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to load tasks');
      setTasks(data.data?.jobs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(); }, [agentId]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !scheduleValue.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          scheduleKind,
          scheduleValue: scheduleValue.trim(),
          message: message.trim(),
          model: model.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string | { message?: string } };
      if (!res.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to create task');
      setName('');
      setScheduleKind('every');
      setScheduleValue('1h');
      setMessage('');
      setModel('');
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }

  async function toggleTask(task: TaskItem) {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !(task.enabled !== false) }),
    });
    if (res.ok) await loadTasks();
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
        setRunsText('');
      }
      await loadTasks();
    }
  }

  async function runTask(taskId: string) {
    setSelectedTaskId(taskId);
    setRunsText('Running task...');
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}/run`, { method: 'POST' });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; data?: { output?: string }; error?: string | { message?: string } };
    if (!res.ok || data.ok !== true) {
      setRunsText(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to run task');
      return;
    }
    setRunsText(data.data?.output || 'Triggered');
    await loadTasks();
  }

  async function loadRuns(taskId: string) {
    setSelectedTaskId(taskId);
    setRunsText('Loading runs...');
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}/runs?limit=10`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; data?: { runs?: unknown }; error?: string | { message?: string } };
    if (!res.ok || data.ok !== true) {
      setRunsText(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to load runs');
      return;
    }
    setRunsText(typeof data.data?.runs === 'string' ? data.data.runs : JSON.stringify(data.data?.runs, null, 2));
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create and manage recurring work for this agent.</p>
          </div>
          <button type="button" onClick={() => loadTasks()} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Refresh</button>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <form onSubmit={createTask} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none" placeholder="e.g. Weekly summary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Schedule Type</p>
            <select value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as 'every' | 'cron' | 'at')} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none">
              <option value="every">Every</option>
              <option value="cron">Cron</option>
              <option value="at">One-time</option>
            </select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Schedule Value</p>
            <input value={scheduleValue} onChange={(e) => setScheduleValue(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none" placeholder={scheduleKind === 'every' ? 'e.g. 1h' : scheduleKind === 'cron' ? 'e.g. 0 9 * * *' : 'e.g. 2026-03-26T09:00:00Z'} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Model Override</p>
            <div className="mt-1">
              <ModelSelect value={model} onChange={setModel} placeholder="Use default" />
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-muted-foreground">Task Prompt</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 min-h-[100px] w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none" placeholder="What should this agent do when the task runs?" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={creating || !message.trim() || !scheduleValue.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{creating ? 'Creating…' : 'Create Task'}</button>
          </div>
        </form>

        <div className="mt-6 space-y-3">
          {loading ? <div className="text-sm text-muted-foreground">Loading tasks…</div> : tasks.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No tasks yet for this agent.</div> : tasks.map((task) => (
            <div key={task.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{task.name || 'Untitled task'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatSchedule(task)}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${task.enabled !== false ? 'bg-emerald-500/10 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                  {task.enabled !== false ? 'enabled' : 'disabled'}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>Prompt: {(task.payload?.message || task.payload?.text || '—').slice(0, 180)}</div>
                <div>Next run: {formatDateTime(task.state?.nextRunAtMs)}</div>
                <div>Updated: {formatDateTime(task.updatedAtMs || task.createdAtMs)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleTask(task)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">{task.enabled !== false ? 'Disable' : 'Enable'}</button>
                <button type="button" onClick={() => runTask(task.id)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Run now</button>
                <button type="button" onClick={() => loadRuns(task.id)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">View runs</button>
                <button type="button" onClick={() => deleteTask(task.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Run Output / History</h2>
        <p className="mt-1 text-sm text-muted-foreground">Inspect task output or recent run history here.</p>
        <div className="mt-4 rounded-xl border bg-muted/20 p-3">
          <div className="mb-2 text-xs text-muted-foreground">{selectedTaskId ? `Task: ${selectedTaskId}` : 'No task selected'}</div>
          <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{runsText || '—'}</pre>
        </div>
      </div>
    </div>
  );
}

export function AgentDetails({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentDetailRecord | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({ agents: '', identity: '', user: '', soul: '', tools: '' });
  const [activeDocTab, setActiveDocTab] = useState<'agents' | 'identity' | 'user' | 'soul' | 'tools'>('agents');
  const [editingDoc, setEditingDoc] = useState(false);
  const [docDraft, setDocDraft] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const agentRes = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, { cache: 'no-store' });

        const agentData = (await agentRes.json().catch(() => ({}))) as AgentResponse;
        if (!agentRes.ok || agentData.ok !== true || !agentData.data) {
          throw new Error('Failed to load agent details');
        }
        setAgent(agentData.data);

        const docKeys: Array<'agents' | 'identity' | 'user' | 'soul' | 'tools'> = ['agents', 'identity', 'user', 'soul', 'tools'];
        const docResults = await Promise.all(
          docKeys.map(async (docKey) => {
            const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs/${docKey}`, { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as AgentDocResponse;
            return [docKey, data.ok === true ? (data.data?.content || '') : ''] as const;
          })
        );
        setDocs(Object.fromEntries(docResults));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  useEffect(() => {
    setDocDraft(docs[activeDocTab] || '');
    setEditingDoc(false);
  }, [activeDocTab, docs]);

  async function saveDoc() {
    setSavingDoc(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs/${activeDocTab}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: docDraft }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string | { message?: string } };
      if (!res.ok || data.ok !== true) {
        throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to save');
      }
      setDocs((prev) => ({ ...prev, [activeDocTab]: docDraft }));
      setEditingDoc(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
    } finally {
      setSavingDoc(false);
    }
  }

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
            <div className="h-12 w-12 overflow-hidden rounded-full bg-primary/10">
              {agent.identity?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.identity.avatar} alt={agentLabel(agent)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">{agentEmoji(agent)}</div>
              )}
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
        <div className="flex gap-2">
          <Link href={Routes.Tasks} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
            Open Tasks
          </Link>
          <Link href={Routes.Chat} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
            Back to Chat
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Agent Markdown Files</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage AGENTS.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md.</p>
            </div>
            {!editingDoc ? (
              <button type="button" onClick={() => setEditingDoc(true)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditingDoc(false); setDocDraft(docs[activeDocTab] || ''); }} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
                <button type="button" onClick={() => saveDoc()} disabled={savingDoc} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{savingDoc ? 'Saving…' : 'Save'}</button>
              </div>
            )}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
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
                className={`rounded-lg border px-3 py-1.5 text-xs ${activeDocTab === key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={editingDoc ? docDraft : (docs[activeDocTab] || '')}
            onChange={(e) => setDocDraft(e.target.value)}
            readOnly={!editingDoc}
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

      <AgentTasksPanel agentId={agent.id} />
    </div>
  );
}

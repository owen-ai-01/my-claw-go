'use client';

import { Routes } from '@/routes';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type AgentItem = {
  id: string;
  name?: string;
  role?: string;
  department?: string;
  enabled?: boolean;
  identity?: { name?: string; emoji?: string };
};

type TaskItem = {
  id: string;
  name?: string;
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule?: {
    kind?: 'every' | 'cron' | 'at';
    everyMs?: number;
    expr?: string;
    tz?: string;
    at?: string;
  };
  payload?: {
    kind?: string;
    message?: string;
    text?: string;
    model?: string;
  };
  state?: {
    nextRunAtMs?: number;
  };
};

function agentLabel(agent: AgentItem) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function agentEmoji(agent: AgentItem) {
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

export function TasksShell() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('main');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runsTaskId, setRunsTaskId] = useState<string | null>(null);
  const [runsText, setRunsText] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] = useState<'every' | 'cron' | 'at'>(
    'every'
  );
  const [scheduleValue, setScheduleValue] = useState('1h');
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');

  async function loadAgents() {
    setLoading(true);
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { defaultAgentId?: string; agents?: AgentItem[] };
      };
      if (!res.ok || data.ok !== true) throw new Error('Failed to load agents');
      const nextAgents = data.data?.agents || [];
      setAgents(nextAgents);
      const defaultAgent =
        data.data?.defaultAgentId || nextAgents[0]?.id || 'main';
      setSelectedAgentId((prev) =>
        nextAgents.some((a) => a.id === prev) ? prev : defaultAgent
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks(agentId: string) {
    setTasksLoading(true);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/tasks`,
        { cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { jobs?: TaskItem[] };
      };
      if (!res.ok || data.ok !== true) throw new Error('Failed to load tasks');
      setTasks(data.data?.jobs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);
  useEffect(() => {
    if (selectedAgentId) void loadTasks(selectedAgentId);
  }, [selectedAgentId]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setCreating(true);
    try {
      const payload = {
        name: name.trim() || undefined,
        scheduleKind,
        scheduleValue: scheduleValue.trim(),
        message: message.trim(),
        model: model.trim() || undefined,
      };
      const isEditing = Boolean(editingTaskId);
      const res = await fetch(
        isEditing
          ? `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks/${encodeURIComponent(editingTaskId!)}`
          : `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string | { message?: string };
      };
      if (!res.ok || data.ok !== true)
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message ||
                `Failed to ${isEditing ? 'update' : 'create'} task`
        );
      setName('');
      setScheduleKind('every');
      setScheduleValue('1h');
      setMessage('');
      setModel('');
      setEditingTaskId(null);
      await loadTasks(selectedAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setCreating(false);
    }
  }

  async function toggleTask(task: TaskItem) {
    const res = await fetch(
      `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks/${encodeURIComponent(task.id)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !(task.enabled !== false) }),
      }
    );
    if (res.ok) await loadTasks(selectedAgentId);
  }

  async function runTask(taskId: string) {
    setRunsTaskId(taskId);
    setRunsText('Running task...');
    const res = await fetch(
      `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks/${encodeURIComponent(taskId)}/run`,
      { method: 'POST' }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: { output?: string };
      error?: string | { message?: string };
    };
    if (!res.ok || data.ok !== true) {
      setRunsText(
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || 'Failed to run task'
      );
      return;
    }
    setRunsText(data.data?.output || 'Triggered');
    await loadTasks(selectedAgentId);
  }

  async function loadRuns(taskId: string) {
    setRunsTaskId(taskId);
    setRunsText('Loading runs...');
    const res = await fetch(
      `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks/${encodeURIComponent(taskId)}/runs?limit=20`,
      { cache: 'no-store' }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: { runs?: unknown };
      error?: string | { message?: string };
    };
    if (!res.ok || data.ok !== true) {
      setRunsText(
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || 'Failed to load runs'
      );
      return;
    }
    setRunsText(
      typeof data.data?.runs === 'string'
        ? data.data.runs
        : JSON.stringify(data.data?.runs, null, 2)
    );
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(
      `/api/agents/${encodeURIComponent(selectedAgentId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      if (runsTaskId === taskId) {
        setRunsTaskId(null);
        setRunsText('');
      }
      await loadTasks(selectedAgentId);
    }
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage recurring OpenClaw cron jobs for each agent. This is the
            first shippable task-management slice.
          </p>
        </div>
        {selectedAgent ? (
          <button
            type="button"
            onClick={() =>
              router.push(
                `${Routes.SettingsAgents}/${encodeURIComponent(selectedAgent.id)}`
              )
            }
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Open Agent Profile
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Agents</h2>
          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left ${selectedAgentId === agent.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      {agentEmoji(agent)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {agentLabel(agent)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        @{agent.id}
                      </div>
                      {agent.role ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {agent.role}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                {editingTaskId ? 'Edit Task' : 'Create Task'}
              </h2>
              {editingTaskId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTaskId(null);
                    setName('');
                    setScheduleKind('every');
                    setScheduleValue('1h');
                    setMessage('');
                    setModel('');
                  }}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
            <form
              onSubmit={createTask}
              className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                  placeholder="e.g. Weekly traffic summary"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Schedule Type</p>
                <select
                  value={scheduleKind}
                  onChange={(e) =>
                    setScheduleKind(e.target.value as 'every' | 'cron' | 'at')
                  }
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="every">Every</option>
                  <option value="cron">Cron</option>
                  <option value="at">One-time</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Schedule Value</p>
                <input
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                  placeholder={
                    scheduleKind === 'every'
                      ? 'e.g. 1h'
                      : scheduleKind === 'cron'
                        ? 'e.g. 0 9 * * *'
                        : 'e.g. 2026-03-26T09:00:00Z'
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Model Override (optional)
                </p>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                  placeholder="e.g. sonnet"
                />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground">Task Prompt</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 min-h-[110px] w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                  placeholder="Tell the agent what to do when this task runs"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={
                    creating ||
                    !selectedAgentId ||
                    !message.trim() ||
                    !scheduleValue.trim()
                  }
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating
                    ? editingTaskId
                      ? 'Saving…'
                      : 'Creating…'
                    : editingTaskId
                      ? 'Save Task'
                      : 'Create Task'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Agent Tasks</h2>
              <button
                type="button"
                onClick={() => loadTasks(selectedAgentId)}
                className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {tasksLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading tasks…
                </div>
              ) : tasks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No tasks yet for this agent.
                </div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {task.name || 'Untitled task'}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatSchedule(task)}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${task.enabled !== false ? 'bg-emerald-500/10 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}
                      >
                        {task.enabled !== false ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div>
                        Prompt:{' '}
                        {(
                          task.payload?.message ||
                          task.payload?.text ||
                          '—'
                        ).slice(0, 180)}
                      </div>
                      <div>
                        Next run: {formatDateTime(task.state?.nextRunAtMs)}
                      </div>
                      <div>Updated: {formatDateTime(task.updatedAtMs)}</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        {task.enabled !== false ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTaskId(task.id);
                          setName(task.name || '');
                          if (task.schedule?.kind === 'cron') {
                            setScheduleKind('cron');
                            setScheduleValue(task.schedule.expr || '');
                          } else if (task.schedule?.kind === 'at') {
                            setScheduleKind('at');
                            setScheduleValue(task.schedule.at || '');
                          } else {
                            setScheduleKind('every');
                            const everyMs = task.schedule?.everyMs || 3600000;
                            if (everyMs % 3600000 === 0)
                              setScheduleValue(`${everyMs / 3600000}h`);
                            else if (everyMs % 60000 === 0)
                              setScheduleValue(`${everyMs / 60000}m`);
                            else
                              setScheduleValue(
                                `${Math.round(everyMs / 1000)}s`
                              );
                          }
                          setMessage(
                            task.payload?.message || task.payload?.text || ''
                          );
                          setModel(task.payload?.model || '');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => runTask(task.id)}
                        className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        Run now
                      </button>
                      <button
                        type="button"
                        onClick={() => loadRuns(task.id)}
                        className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        View runs
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Run Output / History</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select “Run now” or “View runs” on a task to inspect its output.
          </p>
          <div className="mt-4 rounded-xl border bg-muted/20 p-3">
            <div className="mb-2 text-xs text-muted-foreground">
              {runsTaskId ? `Task: ${runsTaskId}` : 'No task selected'}
            </div>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
              {runsText || '—'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

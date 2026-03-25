import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_HOME } from '../lib/paths.js';
import { sendChatMessage } from './openclaw.js';

const CRON_DIR = path.join(OPENCLAW_HOME, 'cron');
const JOBS_PATH = path.join(CRON_DIR, 'jobs.json');
const RUNS_PATH = path.join(CRON_DIR, 'myclawgo-task-runs.jsonl');

type Schedule =
  | { kind: 'every'; everyMs: number; anchorMs: number }
  | { kind: 'cron'; expr: string; tz?: string }
  | { kind: 'at'; at: string };

export type AgentTaskItem = {
  id: string;
  sessionKey?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule?: Schedule;
  sessionTarget?: 'main' | 'isolated';
  wakeMode?: 'now' | 'next-heartbeat';
  payload?: {
    kind?: string;
    message?: string;
    text?: string;
    model?: string;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
  };
  state?: {
    nextRunAtMs?: number;
  };
};

type JobStore = {
  version: number;
  jobs: AgentTaskItem[];
};

function getAgentSessionKey(agentId: string) {
  return `agent:${agentId}:main`;
}

function durationToMs(input: string) {
  const value = input.trim().toLowerCase();
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) throw new BridgeError('INVALID_PARAMS', `Invalid duration: ${input}`, 400);
  const amount = Number(match[1]);
  const unit = match[2] as 'ms' | 's' | 'm' | 'h' | 'd';
  return amount * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const)[unit];
}

async function ensureCronDir() {
  await fs.mkdir(CRON_DIR, { recursive: true });
}

async function readJobStore(): Promise<JobStore> {
  await ensureCronDir();
  try {
    const raw = await fs.readFile(JOBS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<JobStore>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { version: 1, jobs: [] };
    }
    throw new BridgeError('TASK_STORE_READ_FAILED', 'Failed to read task store', 500, error);
  }
}

async function writeJobStore(store: JobStore) {
  await ensureCronDir();
  await fs.writeFile(JOBS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function computeState(schedule: Schedule | undefined) {
  if (!schedule) return undefined;
  if (schedule.kind === 'every') {
    return { nextRunAtMs: Date.now() + schedule.everyMs };
  }
  if (schedule.kind === 'at') {
    const parsed = Date.parse(schedule.at);
    return Number.isFinite(parsed) ? { nextRunAtMs: parsed } : undefined;
  }
  return undefined;
}

function normalizeSchedule(body: {
  scheduleKind?: 'every' | 'cron' | 'at';
  scheduleValue?: string;
  tz?: string;
}): Schedule {
  const scheduleKind = body.scheduleKind || 'every';
  const scheduleValue = String(body.scheduleValue || '').trim();
  if (!scheduleValue) throw new BridgeError('INVALID_PARAMS', 'scheduleValue is required', 400);

  if (scheduleKind === 'every') {
    return { kind: 'every', everyMs: durationToMs(scheduleValue), anchorMs: Date.now() };
  }
  if (scheduleKind === 'cron') {
    return { kind: 'cron', expr: scheduleValue, ...(body.tz?.trim() ? { tz: body.tz.trim() } : {}) };
  }
  if (scheduleKind === 'at') {
    return { kind: 'at', at: scheduleValue };
  }
  throw new BridgeError('INVALID_PARAMS', `Unsupported scheduleKind: ${scheduleKind}`, 400);
}

async function appendRunLog(entry: Record<string, unknown>) {
  await ensureCronDir();
  await fs.appendFile(RUNS_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function readRunLogs(taskId: string, limit = 20) {
  try {
    const raw = await fs.readFile(RUNS_PATH, 'utf8');
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    const items = lines
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((item) => item && item.taskId === taskId)
      .slice(-limit)
      .reverse();
    return items;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw new BridgeError('TASK_RUNS_READ_FAILED', 'Failed to read task runs', 500, error);
  }
}

export async function listAgentTasks(agentId: string) {
  const sessionKey = getAgentSessionKey(agentId);
  const store = await readJobStore();
  return {
    agentId,
    sessionKey,
    jobs: store.jobs.filter((job) => job.sessionKey === sessionKey),
  };
}

export async function createAgentTask(agentId: string, body: {
  name?: string;
  description?: string;
  scheduleKind?: 'every' | 'cron' | 'at';
  scheduleValue?: string;
  tz?: string;
  message?: string;
  model?: string;
  enabled?: boolean;
}) {
  const message = String(body.message || '').trim();
  if (!message) throw new BridgeError('INVALID_PARAMS', 'message is required', 400);

  const store = await readJobStore();
  const schedule = normalizeSchedule(body);
  const task: AgentTaskItem = {
    id: randomUUID(),
    sessionKey: getAgentSessionKey(agentId),
    name: body.name?.trim() || 'Untitled task',
    description: body.description?.trim() || undefined,
    enabled: body.enabled !== false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    schedule,
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message,
      ...(body.model?.trim() ? { model: body.model.trim() } : {}),
    },
    delivery: {
      mode: 'none',
      channel: 'last',
    },
    state: computeState(schedule),
  };
  store.jobs.push(task);
  await writeJobStore(store);
  return { agentId, task };
}

export async function updateAgentTask(agentId: string, taskId: string, patch: {
  name?: string;
  description?: string;
  scheduleKind?: 'every' | 'cron' | 'at';
  scheduleValue?: string;
  tz?: string;
  message?: string;
  model?: string;
  enabled?: boolean;
}) {
  const store = await readJobStore();
  const sessionKey = getAgentSessionKey(agentId);
  const index = store.jobs.findIndex((job) => job.id === taskId && job.sessionKey === sessionKey);
  if (index < 0) throw new BridgeError('TASK_NOT_FOUND', `Task not found for agent ${agentId}: ${taskId}`, 404);

  const next = { ...store.jobs[index] };
  if (patch.name !== undefined) next.name = String(patch.name || '').trim() || 'Untitled task';
  if (patch.description !== undefined) next.description = String(patch.description || '').trim() || undefined;
  if (patch.message !== undefined) next.payload = { ...(next.payload || {}), kind: 'agentTurn', message: String(patch.message || '').trim() };
  if (patch.model !== undefined) {
    next.payload = { ...(next.payload || {}), kind: 'agentTurn', message: next.payload?.message || '' };
    const trimmed = String(patch.model || '').trim();
    if (!trimmed) delete next.payload.model;
    else next.payload.model = trimmed;
  }
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (patch.scheduleKind && patch.scheduleValue) {
    next.schedule = normalizeSchedule(patch);
    next.state = computeState(next.schedule);
  }
  next.updatedAtMs = Date.now();
  store.jobs[index] = next;
  await writeJobStore(store);
  return { agentId, task: next };
}

export async function deleteAgentTask(agentId: string, taskId: string) {
  const store = await readJobStore();
  const sessionKey = getAgentSessionKey(agentId);
  const nextJobs = store.jobs.filter((job) => !(job.id === taskId && job.sessionKey === sessionKey));
  if (nextJobs.length === store.jobs.length) {
    throw new BridgeError('TASK_NOT_FOUND', `Task not found for agent ${agentId}: ${taskId}`, 404);
  }
  store.jobs = nextJobs;
  await writeJobStore(store);
  return { deleted: true, taskId, agentId };
}

export async function runAgentTask(agentId: string, taskId: string) {
  const store = await readJobStore();
  const sessionKey = getAgentSessionKey(agentId);
  const task = store.jobs.find((job) => job.id === taskId && job.sessionKey === sessionKey);
  if (!task) throw new BridgeError('TASK_NOT_FOUND', `Task not found for agent ${agentId}: ${taskId}`, 404);
  const prompt = task.payload?.message?.trim();
  if (!prompt) throw new BridgeError('INVALID_TASK', `Task ${taskId} has no message payload`, 400);

  const startedAt = Date.now();
  try {
    const result = await sendChatMessage({
      agentId,
      message: prompt,
      timeoutMs: 90000,
      channel: 'task',
      chatScope: taskId,
    });
    const run = {
      id: randomUUID(),
      taskId,
      agentId,
      status: 'ok',
      startedAtMs: startedAt,
      finishedAtMs: Date.now(),
      reply: result.reply,
      model: result.model,
      usage: result.usage,
    };
    await appendRunLog(run);
    return { agentId, taskId, output: result.reply, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run = {
      id: randomUUID(),
      taskId,
      agentId,
      status: 'error',
      startedAtMs: startedAt,
      finishedAtMs: Date.now(),
      error: message,
    };
    await appendRunLog(run);
    throw error;
  }
}

export async function listAgentTaskRuns(agentId: string, taskId: string, limit = 20) {
  const list = await listAgentTasks(agentId);
  const found = list.jobs.find((job) => job.id === taskId);
  if (!found) throw new BridgeError('TASK_NOT_FOUND', `Task not found for agent ${agentId}: ${taskId}`, 404);
  return {
    agentId,
    taskId,
    runs: await readRunLogs(taskId, limit),
  };
}

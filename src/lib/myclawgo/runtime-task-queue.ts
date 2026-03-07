import crypto from 'node:crypto';

type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

export type RuntimeTask = {
  id: string;
  sessionId: string;
  message: string;
  status: TaskStatus;
  reply?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const tasks = new Map<string, RuntimeTask>();

function nowIso() {
  return new Date().toISOString();
}

function patchTask(id: string, patch: Partial<RuntimeTask>) {
  const current = tasks.get(id);
  if (!current) return;
  tasks.set(id, { ...current, ...patch, updatedAt: nowIso() });
}

export function createRuntimeTask(
  sessionId: string,
  message: string,
  runner: () => Promise<{ reply: string }>
) {
  const id = crypto.randomUUID();
  const task: RuntimeTask = {
    id,
    sessionId,
    message,
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  tasks.set(id, task);

  setTimeout(async () => {
    patchTask(id, { status: 'running' });
    try {
      const result = await runner();
      patchTask(id, { status: 'done', reply: result.reply });
    } catch (error: unknown) {
      patchTask(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Task failed',
      });
    }
  }, 0);

  return task;
}

export function getRuntimeTask(taskId: string) {
  return tasks.get(taskId) || null;
}

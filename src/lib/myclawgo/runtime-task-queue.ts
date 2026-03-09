import crypto from 'node:crypto';
import { getDb } from '@/db';
import { runtimeTask } from '@/db/schema';
import { eq, and, lt, inArray } from 'drizzle-orm';

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const KEEP_FINISHED_DAYS = 7;

let lastCleanupAt = 0;

async function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    const db = await getDb();
    const cutoff = new Date(now - KEEP_FINISHED_DAYS * 24 * 60 * 60 * 1000);
    await db
      .delete(runtimeTask)
      .where(
        and(
          inArray(runtimeTask.status, ['done', 'failed']),
          lt(runtimeTask.finishedAt, cutoff)
        )
      );
  } catch {
    // non-blocking
  }
}

export async function createRuntimeTask(
  sessionId: string,
  message: string,
  isCommand: boolean,
  runner: () => Promise<{ reply: string }>,
  onError?: (errorMessage: string) => Promise<void> | void
) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(runtimeTask).values({
    id,
    sessionId,
    message,
    isCommand,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  });

  // Run async (fire-and-forget)
  setImmediate(async () => {
    try {
      await db
        .update(runtimeTask)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(runtimeTask.id, id));

      const result = await runner();

      await db
        .update(runtimeTask)
        .set({
          status: 'done',
          reply: result.reply,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(runtimeTask.id, id));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Task failed';
      await db
        .update(runtimeTask)
        .set({
          status: 'failed',
          error: errorMessage,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(runtimeTask.id, id))
        .catch(() => {});
      await Promise.resolve(onError?.(errorMessage)).catch(() => {});
    }

    maybeCleanup().catch(() => {});
  });

  return { id, status: 'queued' as TaskStatus };
}

export async function getRuntimeTask(taskId: string) {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(runtimeTask)
      .where(eq(runtimeTask.id, taskId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

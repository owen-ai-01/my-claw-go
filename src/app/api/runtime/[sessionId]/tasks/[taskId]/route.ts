import { auth } from '@/lib/auth';
import { getRuntimeTask } from '@/lib/myclawgo/runtime-task-queue';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ sessionId: string; taskId: string }> }
) {
  const { sessionId, taskId } = await params;

  const authSession = await auth.api.getSession({ headers: await headers() });
  const currentUserId = authSession?.user?.id;

  if (!currentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (currentUserId !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden: session does not belong to current user' },
      { status: 403 }
    );
  }

  const task = getRuntimeTask(taskId);
  if (!task || task.sessionId !== sessionId) {
    return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    status: task.status,
    reply: task.reply,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
}

import { forwardBridgeDelete, forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

export async function PATCH(req: Request, { params }: { params: Promise<{ agentId: string; taskId: string }> }) {
  const { agentId, taskId } = await params;
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson('PATCH', `/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}`, body);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string; taskId: string }> }) {
  const { agentId, taskId } = await params;
  return forwardBridgeDelete(`/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}`);
}

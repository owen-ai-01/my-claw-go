import { forwardBridgeDelete, forwardBridgeGet, forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

function sanitizeAgentPayload(input: any) {
  if (!input || typeof input !== 'object') return input;
  const body = { ...input };
  delete body.role;
  delete body.description;
  delete body.department;
  delete body.enabled;
  return body;
}

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return forwardBridgeGet(`/agents/${encodeURIComponent(agentId)}`);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const body = sanitizeAgentPayload(await req.json().catch(() => ({})));
  return forwardBridgeJson('PATCH', `/agents/${encodeURIComponent(agentId)}`, body);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return forwardBridgeDelete(`/agents/${encodeURIComponent(agentId)}`);
}

import { forwardBridgeGet, forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return forwardBridgeGet(`/agents/${encodeURIComponent(agentId)}`);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson('PATCH', `/agents/${encodeURIComponent(agentId)}`, body);
}

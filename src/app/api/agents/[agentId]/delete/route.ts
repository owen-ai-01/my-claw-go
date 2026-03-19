import { forwardBridgeDelete } from '@/lib/myclawgo/bridge-fetch';

export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return forwardBridgeDelete(`/agents/${encodeURIComponent(agentId)}`);
}

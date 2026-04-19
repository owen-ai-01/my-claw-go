import { forwardBridgeGet } from '@/lib/myclawgo/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  return forwardBridgeGet(`/agents/${encodeURIComponent(agentId)}/status`);
}

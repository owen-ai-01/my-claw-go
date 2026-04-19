import {
  forwardBridgeGet,
  forwardBridgeJson,
} from '@/lib/myclawgo/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  return forwardBridgeGet(`/agents/${encodeURIComponent(agentId)}/agents-md`);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson(
    'PUT',
    `/agents/${encodeURIComponent(agentId)}/agents-md`,
    body
  );
}

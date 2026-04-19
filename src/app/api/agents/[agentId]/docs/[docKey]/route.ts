import {
  forwardBridgeGet,
  forwardBridgeJson,
} from '@/lib/myclawgo/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string; docKey: string }> }
) {
  const { agentId, docKey } = await params;
  return forwardBridgeGet(
    `/agents/${encodeURIComponent(agentId)}/docs/${encodeURIComponent(docKey)}`
  );
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ agentId: string; docKey: string }> }
) {
  const { agentId, docKey } = await params;
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson(
    'PUT',
    `/agents/${encodeURIComponent(agentId)}/docs/${encodeURIComponent(docKey)}`,
    body
  );
}

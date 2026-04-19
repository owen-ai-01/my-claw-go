import { forwardBridgeGet } from '@/lib/myclawgo/bridge-fetch';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentId: string; taskId: string }> }
) {
  const { agentId, taskId } = await params;
  const url = new URL(req.url);
  const limit = url.searchParams.get('limit');
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return forwardBridgeGet(
    `/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}/runs${qs}`
  );
}

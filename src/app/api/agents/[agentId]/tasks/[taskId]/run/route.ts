import { forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ agentId: string; taskId: string }> }
) {
  const { agentId, taskId } = await params;
  return forwardBridgeJson(
    'POST',
    `/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}/run`,
    {}
  );
}

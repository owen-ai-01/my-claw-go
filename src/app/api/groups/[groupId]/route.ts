import {
  forwardBridgeDelete,
  forwardBridgeGet,
  forwardBridgeJson,
} from '@/lib/myclawgo/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  return forwardBridgeGet(`/groups/${encodeURIComponent(groupId)}`);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson(
    'PATCH',
    `/groups/${encodeURIComponent(groupId)}`,
    body
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  return forwardBridgeDelete(`/groups/${encodeURIComponent(groupId)}`);
}

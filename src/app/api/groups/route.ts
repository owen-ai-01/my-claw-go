import { forwardBridgeGet, forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

export async function GET() {
  return forwardBridgeGet('/groups');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return forwardBridgeJson('POST', '/groups', body);
}

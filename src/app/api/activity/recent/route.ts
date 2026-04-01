import { forwardBridgeGet } from '@/lib/myclawgo/bridge-fetch';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 120);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 20), 500) : 120;
  return forwardBridgeGet(`/activity/recent?limit=${safeLimit}`);
}

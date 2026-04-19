import { forwardBridgeGet } from '@/lib/myclawgo/bridge-fetch';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') === 'bridge' ? 'bridge' : 'gateway';
  const lines = Number(searchParams.get('lines') || 120);
  const safeLines = Number.isFinite(lines)
    ? Math.min(Math.max(lines, 20), 500)
    : 120;
  return forwardBridgeGet(
    `/logs/recent?source=${encodeURIComponent(source)}&lines=${safeLines}`
  );
}

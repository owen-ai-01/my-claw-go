import { forwardBridgeGet } from '@/lib/myclawgo/bridge-fetch';

export async function GET() {
  return forwardBridgeGet('/agents');
}

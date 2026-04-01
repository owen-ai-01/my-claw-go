import { forwardBridgeDelete, forwardBridgeGet, forwardBridgeJson } from '@/lib/myclawgo/bridge-fetch';

function sanitizeAgentPayload(input: any) {
  if (!input || typeof input !== 'object') return input;
  const body = { ...input };
  delete body.role;
  delete body.description;
  delete body.department;
  delete body.enabled;
  return body;
}

export async function GET() {
  return forwardBridgeGet('/agents');
}

export async function POST(req: Request) {
  const body = sanitizeAgentPayload(await req.json().catch(() => ({})));
  return forwardBridgeJson('POST', '/agents', body);
}

import { auth } from '@/lib/auth';
import { resolveUserGatewayProxyTarget } from '@/lib/myclawgo/gateway-proxy-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const target = await resolveUserGatewayProxyTarget(userId);
  if (!target.ok) {
    return NextResponse.json(target, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'WebSocket upgrade required',
      code: 'upgrade-required',
      target: {
        userId: target.userId,
        containerName: target.containerName,
        gateway: target.gateway,
      },
      note: 'Step 2 complete: proxy entry path and runtime target resolution are in place. Step 3 will wire the actual WebSocket upgrade + frame forwarding.',
    },
    {
      status: 426,
      headers: {
        Upgrade: 'websocket',
      },
    }
  );
}

import { auth } from '@/lib/auth';
import {
  clearChatHistory,
  deleteMessage,
  getChatHistoryPage,
} from '@/lib/myclawgo/user-data';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (authSession?.user?.id !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const result = await getChatHistoryPage(sessionId, page);
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (authSession?.user?.id !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => ({}));
  if (body?.messageId) {
    const deleted = await deleteMessage(sessionId, body.messageId);
    return NextResponse.json({ ok: deleted });
  }
  await clearChatHistory(sessionId);
  return NextResponse.json({ ok: true });
}

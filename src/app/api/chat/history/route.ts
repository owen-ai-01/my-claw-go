import { auth } from '@/lib/auth';
import { readChatHistory } from '@/lib/myclawgo/user-data';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const messages = await readChatHistory(userId).catch(() => []);
  return NextResponse.json({ ok: true, messages });
}

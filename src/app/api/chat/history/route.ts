import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { userChatMessage } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get('agentId') || 'main';
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);

  const db = await getDb();
  const messages = await db
    .select()
    .from(userChatMessage)
    .where(and(eq(userChatMessage.userId, userId), eq(userChatMessage.agentId, agentId)))
    .orderBy(asc(userChatMessage.createdAt))
    .limit(limit);

  return NextResponse.json({
    ok: true,
    data: {
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.createdAt,
      })),
    },
  });
}

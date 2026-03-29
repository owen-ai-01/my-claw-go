import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { userChatBillingAudit } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = req.nextUrl.searchParams.get('agentId') || 'main';

  try {
    const db = await getDb();
    const rows = await db
      .select({
        input: sql<number>`coalesce(sum(${userChatBillingAudit.inputTokens}), 0)`,
        output: sql<number>`coalesce(sum(${userChatBillingAudit.outputTokens}), 0)`,
      })
      .from(userChatBillingAudit)
      .where(
        and(
          eq(userChatBillingAudit.userId, userId),
          eq(userChatBillingAudit.agentId, agentId),
          eq(userChatBillingAudit.status, 'ok')
        )
      );

    const input = Number(rows[0]?.input || 0);
    const output = Number(rows[0]?.output || 0);

    return NextResponse.json({
      ok: true,
      tokens: {
        input,
        output,
        total: input + output,
      },
    });
  } catch {
    return NextResponse.json({ ok: true, tokens: { input: 0, output: 0, total: 0 } });
  }
}

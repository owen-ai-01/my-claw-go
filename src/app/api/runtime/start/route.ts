import { getDb } from '@/db';
import { payment, userCredit } from '@/db/schema';
import { auth } from '@/lib/auth';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { ensureSessionById } from '@/lib/myclawgo/session-store';
import { PaymentTypes } from '@/payment/types';
import { and, desc, eq, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ ok: true, action: 'login-required' });
  }

  const userId = session.user.id;
  const db = await getDb();

  const sub = await db
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.userId, userId),
        eq(payment.type, PaymentTypes.SUBSCRIPTION),
        eq(payment.paid, true),
        or(eq(payment.status, 'active'), eq(payment.status, 'trialing'))
      )
    )
    .orderBy(desc(payment.createdAt))
    .limit(1);

  if (!sub.length) {
    return NextResponse.json({
      ok: true,
      action: 'redirect-pricing',
      redirectTo: '/pricing',
    });
  }

  const credit = await db
    .select({ currentCredits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(1);

  const credits = credit[0]?.currentCredits ?? 0;

  if (credits <= 0) {
    return NextResponse.json({
      ok: true,
      action: 'redirect-bot-low-credits',
      redirectTo: `/${userId}/bot?lowCredits=1`,
      credits,
    });
  }

  const runtimeSession = await ensureSessionById(userId, 'start-button');
  const runtime = await ensureUserContainer(runtimeSession);

  if (!runtime.ok) {
    return NextResponse.json(
      {
        ok: false,
        action: 'runtime-not-ready',
        error: runtime.error || 'Failed to prepare runtime container',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    action: 'redirect-bot',
    redirectTo: `/${userId}/bot`,
    credits,
  });
}

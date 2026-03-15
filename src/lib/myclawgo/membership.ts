/**
 * Server-side membership check for API routes.
 * Queries the payment table directly (no server-action context needed).
 */
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { getUserCredits } from '@/credits/credits';
import { and, desc, eq, or } from 'drizzle-orm';
import { PaymentScenes, PaymentTypes } from '@/payment/types';

export type MembershipResult =
  | { isPaid: true }
  | { isPaid: false };

/**
 * Check if a user has an active paid plan (lifetime or active/trialing subscription).
 */
export async function checkUserMembership(userId: string): Promise<MembershipResult> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.paid, true),
          eq(payment.userId, userId),
          or(
            and(
              eq(payment.type, PaymentTypes.ONE_TIME),
              eq(payment.scene, PaymentScenes.LIFETIME),
              eq(payment.status, 'completed')
            ),
            and(
              eq(payment.type, PaymentTypes.SUBSCRIPTION),
              or(eq(payment.status, 'active'), eq(payment.status, 'trialing'))
            )
          )
        )
      )
      .orderBy(desc(payment.createdAt))
      .limit(1);

    return { isPaid: rows.length > 0 };
  } catch (error) {
    console.error('checkUserMembership error:', error);
    // Fail open on DB errors to avoid blocking users
    return { isPaid: false };
  }
}

/**
 * Check if a user has enough credits (≥ minRequired).
 */
export async function checkUserCredits(
  userId: string,
  minRequired = 1
): Promise<{ hasCredits: boolean; balance: number }> {
  const balance = await getUserCredits(userId);
  return { hasCredits: balance >= minRequired, balance };
}

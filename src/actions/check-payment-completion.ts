'use server';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { userActionClient } from '@/lib/safe-action';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const checkPaymentCompletionSchema = z.object({
  sessionId: z.string().min(8).max(128),
});

/**
 * Check if a payment is completed for the given session ID
 */
export const checkPaymentCompletionAction = userActionClient
  .schema(checkPaymentCompletionSchema)
  .action(async ({ parsedInput: { sessionId }, ctx }) => {
    try {
      if (!ctx.user?.id) {
        return {
          success: false,
          error: 'Unauthorized',
        };
      }

      const db = await getDb();
      const paymentRecord = await db
        .select({ paid: payment.paid })
        .from(payment)
        .where(
          and(eq(payment.sessionId, sessionId), eq(payment.userId, ctx.user.id))
        )
        .limit(1);

      const isPaid = paymentRecord[0]?.paid ?? false;

      return {
        success: true,
        isPaid,
      };
    } catch (error) {
      console.error('Check payment completion error:', error);
      return {
        success: false,
        error: 'Failed to check payment completion',
      };
    }
  });

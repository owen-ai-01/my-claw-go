/**
 * Backfill OpenRouter per-user sub-keys for existing active subscribers.
 *
 * Finds all users with active/trialing subscriptions that don't yet have a
 * provisioned OR key and calls provisionUserOpenrouterKey() for each.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-or-keys.ts
 */

import dotenv from 'dotenv';
import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { payment, userOpenrouterKey } from '../src/db/schema.js';
import { provisionUserOpenrouterKey } from '../src/lib/myclawgo/openrouter-key-provisioner.js';
import { PaymentTypes } from '../src/payment/types.js';

dotenv.config();

async function backfillOrKeys() {
  const db = await getDb();

  // Find userIds that already have a provisioned key
  const provisioned = await db
    .select({ userId: userOpenrouterKey.userId })
    .from(userOpenrouterKey);
  const provisionedIds = provisioned.map((r) => r.userId);

  // Find active/trialing subscription users that don't yet have a key
  const query = db
    .selectDistinct({ userId: payment.userId })
    .from(payment)
    .where(
      and(
        eq(payment.type, PaymentTypes.SUBSCRIPTION),
        eq(payment.paid, true),
      )
    );

  const rows = await query;
  const targets = provisionedIds.length > 0
    ? rows.filter((r) => !provisionedIds.includes(r.userId))
    : rows;

  console.log(
    `Found ${rows.length} active subscriber(s), ${targets.length} without OR key — provisioning...`
  );

  let ok = 0;
  let fail = 0;
  for (const { userId } of targets) {
    try {
      await provisionUserOpenrouterKey(userId);
      ok++;
    } catch (err) {
      console.error(`  [FAIL] userId=${userId}`, err);
      fail++;
    }
  }

  console.log(`Done. success=${ok} fail=${fail}`);
  process.exit(0);
}

backfillOrKeys();

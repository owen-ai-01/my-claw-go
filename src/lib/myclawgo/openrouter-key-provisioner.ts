/**
 * OpenRouter per-user provisioned key management.
 *
 * Each paying user gets their own OpenRouter sub-key with a spending limit
 * that matches their plan tier. The actual platform master key is never
 * injected into user containers — only the per-user sub-key is.
 *
 * Requires env:
 *   OPENROUTER_MANAGEMENT_KEY  — management key with key-provisioning role (created separately in OpenRouter dashboard)
 *   OPENROUTER_MANAGEMENT_KEY         — platform API key for regular AI calls (injected into containers as fallback)
 */

import crypto from 'node:crypto';
import { getDb } from '@/db';
import { payment, userOpenrouterKey } from '@/db/schema';
import { PaymentTypes } from '@/payment/types';
import { and, eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { decryptConfigValue, encryptConfigValue } from './agent-config';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/** Spending limit in whole USD per plan tier, monthly reset. */
const TIER_LIMIT_USD: Record<string, number> = {
  pro: 15,
  premium: 30,
  ultra: 100,
};

function getManagementKey(): string {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key) throw new Error('OPENROUTER_MANAGEMENT_KEY is not configured');
  return key;
}

/** Derive plan tier from active subscription priceId. */
async function getUserTier(userId: string): Promise<string> {
  try {
    const db = await getDb();
    const sub = await db
      .select({ priceId: payment.priceId })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.SUBSCRIPTION),
          eq(payment.paid, true)
        )
      )
      .orderBy(desc(payment.createdAt))
      .limit(1);

    const priceId = sub[0]?.priceId ?? '';
    const premiumIds = [
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY,
    ].filter(Boolean);
    if (premiumIds.includes(priceId)) return 'premium';

    const ultraIds = [
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTRA_MONTHLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTRA_YEARLY,
    ].filter(Boolean);
    if (ultraIds.includes(priceId)) return 'ultra';
  } catch {
    // fall through to default
  }
  return 'pro';
}

/** Call OpenRouter management API with exponential backoff retry (max 3 attempts). */
async function orFetch(
  path: string,
  options: RequestInit,
  attempt = 1
): Promise<Response> {
  const res = await fetch(`${OPENROUTER_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getManagementKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Retry on 429 / 5xx, but not on 4xx auth/validation errors
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      const delay = 500 * 2 ** (attempt - 1); // 500ms, 1000ms
      await new Promise((r) => setTimeout(r, delay));
      return orFetch(path, options, attempt + 1);
    }
    throw new Error(
      `OpenRouter API ${options.method ?? 'GET'} ${path} failed (${res.status}): ${body}`
    );
  }
  return res;
}

/**
 * Provision (create or update) a per-user OpenRouter key.
 * Called when a subscription activates or renews.
 */
export async function provisionUserOpenrouterKey(
  userId: string
): Promise<void> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) {
    console.warn(
      '[OR-Key] OPENROUTER_MANAGEMENT_KEY not set — skipping key provisioning'
    );
    return;
  }

  try {
    const tier = await getUserTier(userId);
    const limitUsd = TIER_LIMIT_USD[tier] ?? TIER_LIMIT_USD.pro;
    const db = await getDb();

    // Check if user already has a provisioned key
    const existing = await db
      .select()
      .from(userOpenrouterKey)
      .where(eq(userOpenrouterKey.userId, userId))
      .limit(1);

    if (existing[0]) {
      // Update the spending limit on the existing key
      await orFetch(`/keys/${existing[0].keyHash}`, {
        method: 'PATCH',
        body: JSON.stringify({ limit: limitUsd, limit_reset: 'monthly' }),
      });
      await db
        .update(userOpenrouterKey)
        .set({ limitUsd, updatedAt: new Date() })
        .where(eq(userOpenrouterKey.userId, userId));
      console.log(
        `[OR-Key] Updated key limit for user ${userId} to $${limitUsd}/mo`
      );
      return;
    }

    // Create a new key
    const res = await orFetch('/keys', {
      method: 'POST',
      body: JSON.stringify({
        name: `myclawgo-user-${userId}`,
        limit: limitUsd,
        limit_reset: 'monthly',
      }),
    });
    const data = (await res.json()) as { key: string; data: { hash: string } };

    const keyEncrypted = encryptConfigValue(data.key);
    await db.insert(userOpenrouterKey).values({
      id: crypto.randomUUID(),
      userId,
      keyHash: data.data.hash,
      keyEncrypted,
      limitUsd,
    });
    console.log(
      `[OR-Key] Provisioned new key for user ${userId}, limit $${limitUsd}/mo`
    );
  } catch (error) {
    // Non-fatal: log and continue. Container will fall back to platform key.
    console.error(
      `[OR-Key] Failed to provision key for user ${userId}:`,
      error
    );
  }
}

/**
 * Revoke the per-user OpenRouter key.
 * Called when subscription is cancelled/deleted.
 */
export async function revokeUserOpenrouterKey(userId: string): Promise<void> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) return;

  try {
    const db = await getDb();
    const existing = await db
      .select()
      .from(userOpenrouterKey)
      .where(eq(userOpenrouterKey.userId, userId))
      .limit(1);

    if (!existing[0]) return;

    await orFetch(`/keys/${existing[0].keyHash}`, { method: 'DELETE' });
    await db
      .delete(userOpenrouterKey)
      .where(eq(userOpenrouterKey.userId, userId));
    console.log(`[OR-Key] Revoked key for user ${userId}`);
  } catch (error) {
    console.error(`[OR-Key] Failed to revoke key for user ${userId}:`, error);
  }
}

/**
 * Get the decrypted per-user OpenRouter key for container injection.
 * Returns null if not provisioned — caller should fall back to platform key.
 */
export async function getUserOpenrouterKey(
  userId: string
): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db
      .select({ keyEncrypted: userOpenrouterKey.keyEncrypted })
      .from(userOpenrouterKey)
      .where(eq(userOpenrouterKey.userId, userId))
      .limit(1);

    if (!row[0]) return null;
    return decryptConfigValue(row[0].keyEncrypted);
  } catch {
    return null;
  }
}

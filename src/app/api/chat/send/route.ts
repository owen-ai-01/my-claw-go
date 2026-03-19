import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { userChatBillingAudit } from '@/db/schema';
import { consumeCredits } from '@/credits/credits';
import {
  type BridgeUsage,
  calcUsdCostFromBridgeUsage,
  creditsFromUsd,
  estimateUsage,
  estimateUsdCostByModel,
  normalizeBridgeUsage,
  resolvePricingModelKey,
} from '@/lib/myclawgo/billing';
import { checkUserCredits } from '@/lib/myclawgo/membership';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const MIN_CREDITS_PER_MESSAGE = 1;

/**
 * Deduct credits in the background — does NOT block the HTTP response.
 * Formula: credits = ceil(openrouter_usd_cost / 0.001)
 * e.g. $1 USD cost → 1000 credits deducted
 */
function deductCreditsAsync(params: {
  userId: string;
  agentId: string;
  message: string;
  reply: string;
  model: string;
  usage: BridgeUsage | null;
}) {
  const { userId, agentId, message, reply, model, usage } = params;

  // fire-and-forget — intentionally not awaited
  Promise.resolve().then(async () => {
    const db = await getDb();
    const auditBase = {
      id: crypto.randomUUID(),
      userId,
      agentId,
      model: model || null,
      pricingModelKey: model ? resolvePricingModelKey(model) : null,
      source: 'fallback',
      status: 'ok',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      usdCost: null as string | null,
      creditsDeducted: null as number | null,
      error: null as string | null,
      metaJson: null as Record<string, unknown> | null,
    };

    try {
      let usdCost: number;
      let source: string;
      let tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

      if (model && usage && (usage.input != null || usage.output != null || usage.total != null)) {
        // Priority 1: actual token usage from bridge (most accurate)
        usdCost = calcUsdCostFromBridgeUsage({ model, usage });
        tokens = normalizeBridgeUsage(usage);
        source = 'actual';
      } else if (model) {
        // Priority 2: estimate from text length
        const est = estimateUsage(message, reply);
        usdCost = estimateUsdCostByModel({ model, inputTokens: est.inputTokens, outputTokens: est.outputTokens });
        tokens = { inputTokens: est.inputTokens, outputTokens: est.outputTokens, cacheReadTokens: 0 };
        source = 'estimated';
      } else {
        usdCost = 0;
        source = 'fallback';
      }

      const creditsToDeduct = usdCost > 0 ? creditsFromUsd(usdCost) : MIN_CREDITS_PER_MESSAGE;

      console.log(
        `[chat/send] user=${userId} model=${model} pricingKey=${auditBase.pricingModelKey}` +
        ` source=${source} in=${tokens.inputTokens} out=${tokens.outputTokens}` +
        ` cache=${tokens.cacheReadTokens} usd=${usdCost.toFixed(6)} credits=${creditsToDeduct}`
      );

      await consumeCredits({
        userId,
        amount: creditsToDeduct,
        description: `Chat [${model || 'unknown'}]: ${creditsToDeduct} credits (${source})`,
      });

      await db.insert(userChatBillingAudit).values({
        ...auditBase,
        source,
        status: 'ok',
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        usdCost: usdCost.toFixed(6),
        creditsDeducted: creditsToDeduct,
        metaJson: usage ? { usage } : null,
      }).catch(() => null);
    } catch (err) {
      console.error('[chat/send] async credit deduction failed:', err);
      await db.insert(userChatBillingAudit).values({
        ...auditBase,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        metaJson: usage ? { usage } : null,
      }).catch(() => null);
    }
  });
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    agentId?: string;
    groupId?: string;
    timeoutMs?: number;
    channel?: string;
    chatScope?: string;
  };

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const agentId = String(body.agentId || 'main');

  // ── Pre-flight: block users with zero credits ────────────────────────────
  const creditCheck = await checkUserCredits(userId, MIN_CREDITS_PER_MESSAGE);
  if (!creditCheck.hasCredits) {
    return NextResponse.json(
      {
        ok: false,
        code: 'insufficient_credits',
        error: 'Insufficient credits. Please top up to continue chatting.',
        balance: creditCheck.balance,
      },
      { status: 402 }
    );
  }

  const target = await resolveUserBridgeTarget(userId);
  if (!target.ok) {
    return NextResponse.json(target, { status: 503 });
  }

  const db = await getDb();

  try {
    const bridgeFetchStartedAt = Date.now();
    const upstreamRes = await fetch(`${target.bridge.baseUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${target.bridge.token}`,
      },
      body: JSON.stringify({
        message,
        agentId,
        groupId: body.groupId,
        timeoutMs: body.timeoutMs || 90000,
        channel: body.channel || 'direct',
        chatScope: body.chatScope || 'default',
      }),
    });

    const bridgeFetchDurationMs = Date.now() - bridgeFetchStartedAt;
    const payload = await upstreamRes.json().catch(() => ({
      ok: false,
      error: 'Invalid bridge response',
    })) as {
      ok?: boolean;
      data?: {
        reply?: string;
        model?: string;
        usage?: BridgeUsage;
        routedAgentId?: string;
        groupId?: string;
        timing?: { bridgeRouteMs?: number; openclawAgentMs?: number };
      };
      error?: string;
    };

    if (payload.ok === true && payload.data?.reply) {
      const reply = payload.data.reply;
      const model = payload.data.model || '';
      const usage = payload.data.usage || null;

      // Deduct credits AFTER response is ready — fire-and-forget, zero latency impact
      deductCreditsAsync({ userId, agentId, message, reply, model, usage });
    }

    if (payload.ok === true && !payload.data?.reply?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          code: 'empty_reply',
          error: 'Agent returned an empty reply',
        },
        { status: 502 }
      );
    }

    const totalDurationMs = Date.now() - requestStartedAt;
    const apiOverheadMs = Math.max(0, totalDurationMs - bridgeFetchDurationMs);

    // Strip internal data before returning to client
    const clientPayload = payload.ok === true && payload.data
      ? {
          ok: true,
          data: {
            reply: payload.data.reply,
            routedAgentId: payload.data.routedAgentId,
            groupId: payload.data.groupId,
            timing: {
              totalMs: totalDurationMs,
              platformApiMs: totalDurationMs,
              bridgeHttpMs: bridgeFetchDurationMs,
              platformOverheadMs: apiOverheadMs,
              bridgeRouteMs: payload.data.timing?.bridgeRouteMs,
              openclawAgentMs: payload.data.timing?.openclawAgentMs,
            },
          },
        }
      : payload;

    return NextResponse.json(clientPayload, { status: upstreamRes.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'bridge_request_failed',
        error: error instanceof Error ? error.message : 'Bridge request failed',
      },
      { status: 502 }
    );
  }
}

import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { userChatMessage } from '@/db/schema';
import { consumeCredits } from '@/credits/credits';
import {
  type BridgeUsage,
  calcUsdCostFromBridgeUsage,
  creditsFromUsd,
  estimateUsage,
  estimateUsdCostByModel,
} from '@/lib/myclawgo/billing';
import { checkUserCredits } from '@/lib/myclawgo/membership';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const MIN_CREDITS_PER_MESSAGE = 1;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    agentId?: string;
    timeoutMs?: number;
  };

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const agentId = String(body.agentId || 'main');

  // Credit balance check before sending
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

  // Save user message to DB
  const db = await getDb();
  await db.insert(userChatMessage).values({
    id: crypto.randomUUID(),
    userId,
    agentId,
    role: 'user',
    content: message,
  }).catch(() => null);

  try {
    const upstreamRes = await fetch(`${target.bridge.baseUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${target.bridge.token}`,
      },
      body: JSON.stringify({
        message,
        agentId,
        timeoutMs: body.timeoutMs || 90000,
      }),
    });

    const payload = await upstreamRes.json().catch(() => ({
      ok: false,
      error: 'Invalid bridge response',
    })) as {
      ok?: boolean;
      data?: {
        reply?: string;
        model?: string;
        usage?: BridgeUsage;
      };
      error?: string;
    };

    if (payload.ok === true && payload.data?.reply) {
      const reply  = payload.data.reply;
      const model  = payload.data.model  || '';
      const usage  = payload.data.usage  || null;

      // Save assistant reply to DB
      await db.insert(userChatMessage).values({
        id: crypto.randomUUID(),
        userId,
        agentId,
        role: 'assistant',
        content: reply,
      }).catch(() => null);

      // ── Credit deduction ──────────────────────────────────────────────────
      // Priority 1: use actual token usage returned by the bridge (real model cost)
      // Priority 2: estimate from text length (fallback)
      try {
        let usdCost: number;
        let source: string;

        if (model && usage && (usage.input != null || usage.output != null || usage.total != null)) {
          // Actual usage data from OpenClaw
          usdCost = calcUsdCostFromBridgeUsage({ model, usage });
          source  = `actual usage [${model}]`;
        } else if (model) {
          // Have model name but no usage — estimate from text
          const est = estimateUsage(message, reply);
          usdCost = estimateUsdCostByModel({
            model,
            inputTokens:  est.inputTokens,
            outputTokens: est.outputTokens,
          });
          source = `estimated usage [${model}]`;
        } else {
          // No model info at all — minimum charge
          usdCost = 0;
          source  = 'no model info';
        }

        const creditsToDeduct = usdCost > 0
          ? creditsFromUsd(usdCost)
          : MIN_CREDITS_PER_MESSAGE;

        console.log(
          `[chat/send] user=${userId} model=${model} source=${source}` +
          ` usd=${usdCost.toFixed(6)} credits=${creditsToDeduct}`
        );

        await consumeCredits({
          userId,
          amount:      creditsToDeduct,
          description: `Chat [${model || 'unknown'}]: ${creditsToDeduct} credits (${source})`,
        });
      } catch (creditErr) {
        // Credit deduction failure must NOT block the user's reply
        console.error('[chat/send] credit deduction failed:', creditErr);
      }
    }

    return NextResponse.json(payload, { status: upstreamRes.status });
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

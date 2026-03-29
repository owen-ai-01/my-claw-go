import crypto from 'node:crypto';
import { getDb } from '@/db';
import { userChatBillingAudit, userChatMessage, userChatTask } from '@/db/schema';
import { consumeCredits } from '@/credits/credits';
import {
  calcUsdCostFromBridgeUsage,
  creditsFromUsd,
  estimateUsage,
  resolvePricingModelKey,
} from '@/lib/myclawgo/billing';
import { and, asc, desc, eq } from 'drizzle-orm';
import { resolveUserBridgeTarget } from '@/lib/myclawgo/bridge-target';
import { routeMessage } from '@/lib/myclawgo/model-router';

export async function listUserChatMessages(userId: string, agentId: string) {
  const db = await getDb();
  return db
    .select()
    .from(userChatMessage)
    .where(and(eq(userChatMessage.userId, userId), eq(userChatMessage.agentId, agentId)))
    .orderBy(asc(userChatMessage.createdAt));
}

export async function createDirectChatTask(params: {
  userId: string;
  agentId: string;
  message: string;
  timeoutMs?: number;
  userModelOverride?: string; // 'auto' or explicit model id
}) {
  const { userId, agentId, message, timeoutMs = 180000, userModelOverride } = params;
  const db = await getDb();
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const now = new Date();

  await db.insert(userChatMessage).values([
    {
      id: userMessageId,
      userId,
      agentId,
      role: 'user',
      content: message,
      status: 'done',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: assistantMessageId,
      userId,
      agentId,
      role: 'assistant',
      content: 'Thinking…',
      status: 'running',
      taskId,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(userChatTask).values({
    id: taskId,
    userId,
    agentId,
    status: 'queued',
    userMessageId,
    assistantMessageId,
    createdAt: now,
    updatedAt: now,
  });

  void runDirectChatTask({ taskId, userId, agentId, message, timeoutMs, userModelOverride });

  return { taskId, userMessageId, assistantMessageId };
}

export async function getLatestChatTask(userId: string, agentId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userChatTask)
    .where(and(eq(userChatTask.userId, userId), eq(userChatTask.agentId, agentId)))
    .orderBy(desc(userChatTask.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type DirectChatUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

function extractBillingTokenCounts(usage?: DirectChatUsage) {
  return {
    inputTokens: Math.max(0, Number(usage?.input ?? usage?.input_tokens ?? usage?.prompt_tokens ?? 0)),
    outputTokens: Math.max(0, Number(usage?.output ?? usage?.output_tokens ?? usage?.completion_tokens ?? 0)),
    cacheReadTokens: Math.max(0, Number(usage?.cacheRead ?? 0)),
  };
}

export async function settleDirectChatBilling(params: {
  taskId: string;
  userId: string;
  agentId: string;
  message: string;
  reply: string;
  model?: string;
  usage?: DirectChatUsage;
  bridgeRaw?: unknown;
}) {
  const db = await getDb();
  const modelUsed = params.model || 'openrouter/minimax/minimax-m2.5';
  const pricingModelKey = resolvePricingModelKey(modelUsed);

  try {
    const hasActualUsage = !!params.usage;
    const source = hasActualUsage ? 'actual' : 'estimated';
    const usageForBilling = hasActualUsage
      ? params.usage!
      : (() => {
          const estimated = estimateUsage(params.message, params.reply);
          return {
            input: estimated.inputTokens,
            output: estimated.outputTokens,
            total: estimated.totalTokens,
          };
        })();

    const usdCost = calcUsdCostFromBridgeUsage({
      model: modelUsed,
      usage: usageForBilling,
    });

    const creditsDeducted = creditsFromUsd(usdCost);
    const tokenCounts = extractBillingTokenCounts(usageForBilling);

    await consumeCredits({
      userId: params.userId,
      amount: creditsDeducted,
      paymentId: `chat-task:${params.taskId}`,
      description:
        `MyClawGo direct chat usage: agent=${params.agentId}, model=${modelUsed}, ` +
        `source=${source}, usd_cost=$${usdCost.toFixed(6)}`,
    });

    await db.insert(userChatBillingAudit).values({
      id: crypto.randomUUID(),
      userId: params.userId,
      agentId: params.agentId,
      model: modelUsed,
      pricingModelKey,
      source,
      status: 'ok',
      inputTokens: tokenCounts.inputTokens,
      outputTokens: tokenCounts.outputTokens,
      cacheReadTokens: tokenCounts.cacheReadTokens,
      usdCost: usdCost.toFixed(8),
      creditsDeducted,
      metaJson: {
        taskId: params.taskId,
        bridgeRaw: params.bridgeRaw ?? null,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    const tokenCounts = extractBillingTokenCounts(params.usage);
    await db.insert(userChatBillingAudit).values({
      id: crypto.randomUUID(),
      userId: params.userId,
      agentId: params.agentId,
      model: modelUsed,
      pricingModelKey,
      source: params.usage ? 'actual' : 'estimated',
      status: 'failed',
      inputTokens: tokenCounts.inputTokens,
      outputTokens: tokenCounts.outputTokens,
      cacheReadTokens: tokenCounts.cacheReadTokens,
      error: error instanceof Error ? error.message : 'billing failed',
      metaJson: {
        taskId: params.taskId,
        bridgeRaw: params.bridgeRaw ?? null,
      },
      createdAt: new Date(),
    });
    console.error('settleDirectChatBilling failed:', error instanceof Error ? error.message : error);
  }
}

async function runDirectChatTask(params: {
  taskId: string;
  userId: string;
  agentId: string;
  message: string;
  timeoutMs: number;
  userModelOverride?: string; // 'auto' | specific model id | undefined
}) {
  const { taskId, userId, agentId, message, timeoutMs, userModelOverride } = params;
  const db = await getDb();

  const [task] = await db.select().from(userChatTask).where(eq(userChatTask.id, taskId)).limit(1);
  if (!task) return;

  await db
    .update(userChatTask)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(userChatTask.id, taskId));

  try {
    // ── Smart routing: pick the best model, ALWAYS route through OpenClaw bridge ──
    //
    // All messages must go through OpenClaw (bridge → gateway → agent) to preserve:
    //   - conversation memory & session history
    //   - agent tools (web search, file access, cron, memory_search, etc.)
    //   - SOUL.md / AGENTS.md personality
    //
    // The router only decides WHICH MODEL to use — not whether to bypass OpenClaw.
    // The chosen model is passed to the bridge, which injects it into the OpenClaw
    // session via sessions.patch before running chat.send.
    //
    // Upgrade path:
    //   - Routing rules live here in the platform (model-router.ts).
    //   - To update rules: redeploy platform only, no Docker image changes needed.
    //   - To add a new model tier: add env var + update routing table.
    const routerEnabled = process.env.MYCLAWGO_ROUTER_DISABLED !== 'true';
    const routing = routerEnabled
      ? routeMessage({
          message,
          userModelOverride: userModelOverride && userModelOverride !== 'auto' ? userModelOverride : undefined,
        })
      : null;

    // Effective model: explicit user override > auto router choice > undefined (agent default)
    const resolvedModel = routing?.userOverride || routing?.model || undefined;

    const target = await resolveUserBridgeTarget(userId);
    if (!target.ok) {
      throw new Error('Runtime bridge unavailable');
    }

    const upstreamRes = await fetch(`${target.bridge.baseUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${target.bridge.token}`,
      },
      body: JSON.stringify({
        message,
        agentId,
        timeoutMs,
        channel: 'direct',
        chatScope: 'default',
        // Pass resolved model to bridge. Bridge will inject via sessions.patch
        // before chat.send so OpenClaw uses the right model for this turn.
        ...(resolvedModel ? { model: resolvedModel } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const payload = await upstreamRes.json().catch(() => ({ ok: false, error: 'Invalid bridge response' })) as {
      ok?: boolean;
      data?: {
        reply?: string;
        model?: string;
        usage?: {
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
          total?: number;
          input_tokens?: number;
          output_tokens?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        };
        raw?: unknown;
      };
      error?: string | { message?: string };
    };

    if (!upstreamRes.ok || payload.ok !== true || !payload.data?.reply?.trim()) {
      throw new Error(typeof payload.error === 'string' ? payload.error : payload.error?.message || 'Chat task failed');
    }

    await db.update(userChatMessage)
      .set({ content: payload.data.reply, status: 'done', updatedAt: new Date() })
      .where(eq(userChatMessage.id, task.assistantMessageId));

    await settleDirectChatBilling({
      taskId,
      userId,
      agentId,
      message,
      reply: payload.data.reply,
      model: payload.data.model,
      usage: payload.data.usage,
      bridgeRaw: payload.data.raw,
    });

    if (routing) {
      console.info(`[model-router] taskId=${taskId} level=${routing.level} model=${payload.data.model || resolvedModel || 'agent-default'} reason=${routing.reason}`);
    }

    await db.update(userChatTask)
      .set({ status: 'done', finishedAt: new Date(), updatedAt: new Date(), error: null })
      .where(eq(userChatTask.id, taskId));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Chat task failed';
    await db.update(userChatMessage)
      .set({ content: `⚠️ ${errorMessage}`, status: 'failed', updatedAt: new Date() })
      .where(eq(userChatMessage.id, task.assistantMessageId));

    await db.update(userChatTask)
      .set({ status: 'failed', error: errorMessage, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(userChatTask.id, taskId));
  }
}




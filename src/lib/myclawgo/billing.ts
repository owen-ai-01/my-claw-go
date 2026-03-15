type ModelPricing = {
  // USD per 1M tokens
  inputPer1M: number;
  outputPer1M: number;
  // cacheRead is usually cheaper (default: same as input if not set)
  cacheReadPer1M?: number;
};

/**
 * OpenRouter-based model pricing map.
 *
 * These are the approximate USD costs that OpenRouter charges us per 1M tokens.
 * Keys can be full provider/model strings OR OpenClaw alias names.
 *
 * Business model:
 *   - 1 credit costs us: $0.001 (MYCLAWGO_USD_PER_CREDIT_COST)
 *   - 1 credit sold to users at: $0.005 → 5× gross margin
 *   - Margin covers: VPS/Docker infra, OpenRouter overhead, ad spend, labor
 *
 * Formula: credits_deducted = ceil(openrouter_actual_usd / 0.001)
 *
 * Override at runtime via env: MYCLAWGO_MODEL_PRICING_JSON
 * (JSON object with same keys, { inputPer1M, outputPer1M, cacheReadPer1M })
 */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  'openai/gpt-5.4':            { inputPer1M: 2.5,  outputPer1M: 10.0, cacheReadPer1M: 1.25 },
  'openai/gpt-5.2':            { inputPer1M: 2.0,  outputPer1M: 8.0 },
  'openai/gpt-4o':             { inputPer1M: 2.5,  outputPer1M: 10.0, cacheReadPer1M: 1.25 },
  'openai/gpt-4o-mini':        { inputPer1M: 0.15, outputPer1M: 0.6,  cacheReadPer1M: 0.075 },
  'openai/gpt-4.1':            { inputPer1M: 2.0,  outputPer1M: 8.0,  cacheReadPer1M: 0.5 },
  'openai/gpt-4.1-mini':       { inputPer1M: 0.4,  outputPer1M: 1.6,  cacheReadPer1M: 0.1 },
  'openai/o3':                 { inputPer1M: 10.0, outputPer1M: 40.0 },
  'openai/o4-mini':            { inputPer1M: 1.1,  outputPer1M: 4.4 },
  // OpenClaw aliases
  'gpt':                       { inputPer1M: 2.5,  outputPer1M: 10.0, cacheReadPer1M: 1.25 },
  'gpt-4o':                    { inputPer1M: 2.5,  outputPer1M: 10.0, cacheReadPer1M: 1.25 },
  'gpt-4o-mini':               { inputPer1M: 0.15, outputPer1M: 0.6 },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  'anthropic/claude-opus-4-6': { inputPer1M: 15.0, outputPer1M: 75.0, cacheReadPer1M: 1.5 },
  'anthropic/claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3 },
  'anthropic/claude-haiku-3-5': { inputPer1M: 0.8, outputPer1M: 4.0,  cacheReadPer1M: 0.08 },
  'anthropic/claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3 },
  'anthropic/claude-3-7-sonnet-20250219': { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3 },
  // OpenClaw aliases
  'opus':                      { inputPer1M: 15.0, outputPer1M: 75.0, cacheReadPer1M: 1.5 },
  'sonnet':                    { inputPer1M: 3.0,  outputPer1M: 15.0, cacheReadPer1M: 0.3 },
  'haiku':                     { inputPer1M: 0.8,  outputPer1M: 4.0,  cacheReadPer1M: 0.08 },

  // ── Google ────────────────────────────────────────────────────────────────
  'google/gemini-2.5-pro':     { inputPer1M: 1.25, outputPer1M: 10.0 },
  'google/gemini-2.5-flash':   { inputPer1M: 0.15, outputPer1M: 0.6 },
  'google/gemini-2.0-flash':   { inputPer1M: 0.1,  outputPer1M: 0.4 },

  // ── OpenRouter / DeepSeek ─────────────────────────────────────────────────
  'openrouter/deepseek/deepseek-v3.2':  { inputPer1M: 0.27, outputPer1M: 1.1 },
  'openrouter/deepseek/deepseek-r1':    { inputPer1M: 0.55, outputPer1M: 2.19 },
  'openrouter/minimax/minimax-m2.5':    { inputPer1M: 0.6,  outputPer1M: 2.4 },
  'deepseek/deepseek-chat':             { inputPer1M: 0.27, outputPer1M: 1.1 },
};

function parsePricingFromEnv(): Record<string, ModelPricing> {
  const raw = process.env.MYCLAWGO_MODEL_PRICING_JSON;
  if (!raw) return DEFAULT_PRICING;

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ModelPricing>>;
    const normalized: Record<string, ModelPricing> = { ...DEFAULT_PRICING };

    for (const [model, item] of Object.entries(parsed)) {
      if (
        typeof item?.inputPer1M === 'number' &&
        typeof item?.outputPer1M === 'number'
      ) {
        normalized[model] = {
          inputPer1M: item.inputPer1M,
          outputPer1M: item.outputPer1M,
          cacheReadPer1M: item.cacheReadPer1M,
        };
      }
    }

    return normalized;
  } catch {
    return DEFAULT_PRICING;
  }
}

/**
 * Normalize OpenClaw model strings:
 * OpenClaw may return alias like "gpt-5.4" without provider prefix,
 * or "anthropic/claude-sonnet-4-6" in full form. We try both.
 */
function resolveModelKey(model: string, pricingMap: Record<string, ModelPricing>): ModelPricing | null {
  if (!model) return null;
  // 1. Direct match
  if (pricingMap[model]) return pricingMap[model]!;
  // 2. Strip provider prefix: "openai/gpt-4o" → "gpt-4o", "openrouter/minimax/minimax-m2.5" → "minimax/minimax-m2.5"
  const parts = model.split('/');
  const withoutProvider = parts.slice(1).join('/');
  if (withoutProvider && pricingMap[withoutProvider]) return pricingMap[withoutProvider]!;
  // 3. Try with common provider prefixes
  for (const prefix of ['openrouter', 'openai', 'anthropic', 'google']) {
    if (pricingMap[`${prefix}/${model}`]) return pricingMap[`${prefix}/${model}`]!;
    // e.g. "minimax/minimax-m2.5" → "openrouter/minimax/minimax-m2.5"
    if (pricingMap[`${prefix}/${withoutProvider}`]) return pricingMap[`${prefix}/${withoutProvider}`]!;
  }
  return null;
}

// ─── Usage type returned by bridge ───────────────────────────────────────────

export type BridgeUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  // OpenAI-style fallbacks
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

/**
 * Extract normalized token counts from a bridge usage object.
 * Supports OpenClaw format (input/output) and OpenAI format (input_tokens/output_tokens).
 */
export function normalizeBridgeUsage(usage: BridgeUsage): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
} {
  const inputTokens =
    usage.input ??
    usage.input_tokens ??
    usage.prompt_tokens ??
    0;
  const outputTokens =
    usage.output ??
    usage.output_tokens ??
    usage.completion_tokens ??
    0;
  const cacheReadTokens = usage.cacheRead ?? 0;

  return {
    inputTokens: Math.max(0, inputTokens),
    outputTokens: Math.max(0, outputTokens),
    cacheReadTokens: Math.max(0, cacheReadTokens),
  };
}

// ─── Cost calculation ─────────────────────────────────────────────────────────

/**
 * Calculate USD cost using ACTUAL bridge usage + model.
 * This is the primary billing path.
 */
export function calcUsdCostFromBridgeUsage(params: {
  model: string;
  usage: BridgeUsage;
}): number {
  const pricingMap = parsePricingFromEnv();
  const pricing = resolveModelKey(params.model, pricingMap);
  const { inputTokens, outputTokens, cacheReadTokens } = normalizeBridgeUsage(params.usage);

  if (!pricing) {
    // Unknown model: fallback per-token rate
    const usdPerToken = Number(process.env.MYCLAWGO_USD_PER_TOKEN || '0.00001');
    const total = inputTokens + outputTokens + cacheReadTokens;
    return Math.max(0, total * usdPerToken);
  }

  // Regular input tokens (non-cached): inputTokens - cacheReadTokens
  const regularInputTokens = Math.max(0, inputTokens - cacheReadTokens);
  const cacheReadPer1M = pricing.cacheReadPer1M ?? pricing.inputPer1M;

  const inputUsd    = (regularInputTokens / 1_000_000) * pricing.inputPer1M;
  const cacheUsd    = (cacheReadTokens    / 1_000_000) * cacheReadPer1M;
  const outputUsd   = (outputTokens       / 1_000_000) * pricing.outputPer1M;

  return inputUsd + cacheUsd + outputUsd;
}

/**
 * Estimate USD cost from text length (fallback only — no real usage data).
 */
export function estimateUsdCostByModel(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const pricingMap = parsePricingFromEnv();
  const pricing = resolveModelKey(params.model, pricingMap);

  if (!pricing) {
    const usdPerTokenFallback = Number(
      process.env.MYCLAWGO_USD_PER_TOKEN || '0.00001'
    );
    return (params.inputTokens + params.outputTokens) * usdPerTokenFallback;
  }

  const inputUsd  = (params.inputTokens  / 1_000_000) * pricing.inputPer1M;
  const outputUsd = (params.outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputUsd + outputUsd;
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil((text?.length || 0) / 4));
}

export function estimateUsage(message: string, reply: string) {
  const inputTokens  = estimateTokensFromText(message);
  const outputTokens = estimateTokensFromText(reply);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

export function creditsFromUsd(usdCost: number) {
  const usdPerCredit = Number(
    process.env.MYCLAWGO_USD_PER_CREDIT_COST ||
    process.env.MYCLAWGO_USD_PER_CREDIT ||
    '0.001'
  );
  return Math.max(1, Math.ceil(usdCost / usdPerCredit));
}

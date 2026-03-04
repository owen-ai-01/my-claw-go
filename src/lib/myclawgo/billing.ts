type ModelPricing = {
  // USD per 1M tokens
  inputPer1M: number;
  outputPer1M: number;
};

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Keep these in sync with OpenRouter pricing when updating deploy env.
  'openrouter/minimax/minimax-m2.5': { inputPer1M: 0.6, outputPer1M: 2.4 },
  'openai/gpt-5.2': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'openrouter/deepseek/deepseek-v3.2': { inputPer1M: 0.27, outputPer1M: 1.1 },
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
        };
      }
    }

    return normalized;
  } catch {
    return DEFAULT_PRICING;
  }
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil((text?.length || 0) / 4));
}

export function estimateUsage(message: string, reply: string) {
  const inputTokens = estimateTokensFromText(message);
  const outputTokens = estimateTokensFromText(reply);
  const totalTokens = inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

export function estimateUsdCostByModel(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const pricingMap = parsePricingFromEnv();
  const pricing = pricingMap[params.model];

  if (!pricing) {
    const usdPerTokenFallback = Number(
      process.env.MYCLAWGO_USD_PER_TOKEN || '0.00001'
    );
    const totalTokens = params.inputTokens + params.outputTokens;
    return totalTokens * usdPerTokenFallback;
  }

  const inputUsd = (params.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputUsd = (params.outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputUsd + outputUsd;
}

export function creditsFromUsd(usdCost: number) {
  // Cost-side conversion for deduction: 1 credit = $0.001 cost
  const usdPerCredit = Number(
    process.env.MYCLAWGO_USD_PER_CREDIT_COST ||
      process.env.MYCLAWGO_USD_PER_CREDIT ||
      '0.001'
  );
  return Math.max(1, Math.ceil(usdCost / usdPerCredit));
}

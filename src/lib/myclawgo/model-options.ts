import { getPricingModelKeys } from './billing';
import {
  AVAILABLE_MODELS,
  type ModelOption,
  guessModelLabel,
} from './model-catalog';

function parseCommonModelsFromEnv(): string[] {
  const raw = process.env.MYCLAWGO_COMMON_MODELS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSelectablePricingModel(model: string): boolean {
  if (!model) return false;
  if (!model.startsWith('openrouter/')) return false;
  if (model === 'openrouter/auto' || model === 'openrouter/openrouter/auto')
    return false;
  return true;
}

export function getSelectableModelOptions(): ModelOption[] {
  const pricingModels = new Set(
    getPricingModelKeys().filter(isSelectablePricingModel)
  );

  const configuredCommon = parseCommonModelsFromEnv();
  const fromCommon = configuredCommon
    .filter((id) => pricingModels.has(id))
    .map((id) => ({ id, label: guessModelLabel(id) }));

  const defaults = AVAILABLE_MODELS.filter((m) => pricingModels.has(m.id)).map(
    (m) => ({ id: m.id, label: m.label })
  );

  const merged = fromCommon.length > 0 ? fromCommon : defaults;
  const dedup = new Map<string, ModelOption>();
  for (const item of merged) {
    if (!dedup.has(item.id)) dedup.set(item.id, item);
  }

  return [...dedup.values()];
}

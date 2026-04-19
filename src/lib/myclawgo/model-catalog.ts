export type ModelOption = { id: string; label: string };

export const AVAILABLE_MODELS: ModelOption[] = [
  // OpenAI
  { id: 'openrouter/openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
  { id: 'openrouter/openai/gpt-5-mini', label: 'OpenAI · GPT-5 Mini' },
  { id: 'openrouter/openai/gpt-5.1', label: 'OpenAI · GPT-5.1' },
  { id: 'openrouter/openai/gpt-5.2', label: 'OpenAI · GPT-5.2' },
  { id: 'openrouter/openai/gpt-5.3-codex', label: 'OpenAI · GPT-5.3 Codex' },
  { id: 'openrouter/openai/gpt-5.4', label: 'OpenAI · GPT-5.4' },

  // Anthropic
  {
    id: 'openrouter/anthropic/claude-haiku-4.5',
    label: 'Anthropic · Claude Haiku 4.5',
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4.5',
    label: 'Anthropic · Claude Sonnet 4.5',
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4.6',
    label: 'Anthropic · Claude Sonnet 4.6',
  },
  {
    id: 'openrouter/anthropic/claude-opus-4.6',
    label: 'Anthropic · Claude Opus 4.6',
  },

  // Google
  {
    id: 'openrouter/google/gemini-2.0-flash-exp',
    label: 'Google · Gemini 2.0 Flash Exp',
  },
  {
    id: 'openrouter/google/gemini-2.0-flash-001',
    label: 'Google · Gemini 2.0 Flash 001',
  },
  {
    id: 'openrouter/google/gemini-2.5-flash-lite',
    label: 'Google · Gemini 2.5 Flash Lite',
  },
  { id: 'openrouter/google/gemini-2.5-pro', label: 'Google · Gemini 2.5 Pro' },
  {
    id: 'openrouter/google/gemini-3-pro-preview',
    label: 'Google · Gemini 3 Pro Preview',
  },

  // DeepSeek
  { id: 'openrouter/deepseek/deepseek-v3', label: 'DeepSeek · V3' },
  { id: 'openrouter/deepseek/deepseek-v3.1', label: 'DeepSeek · V3.1' },
  { id: 'openrouter/deepseek/deepseek-v3.2', label: 'DeepSeek · V3.2' },
  { id: 'openrouter/deepseek/deepseek-r1', label: 'DeepSeek · R1' },

  // Z.ai / GLM
  { id: 'openrouter/z-ai/glm-4.6', label: 'Z.ai · GLM 4.6' },
  { id: 'openrouter/z-ai/glm-4.6v', label: 'Z.ai · GLM 4.6v' },
  { id: 'openrouter/z-ai/glm-4.7', label: 'Z.ai · GLM 4.7' },
  { id: 'openrouter/z-ai/glm-4.7-flash', label: 'Z.ai · GLM 4.7 Flash' },
  { id: 'openrouter/z-ai/glm-5', label: 'Z.ai · GLM 5' },

  // MiniMax
  { id: 'openrouter/minimax/minimax-m2.5', label: 'MiniMax · M2.5' },

  // Moonshot / Kimi
  { id: 'openrouter/moonshotai/kimi-k2', label: 'Moonshot · Kimi K2' },
  {
    id: 'openrouter/moonshotai/kimi-k2-thinking',
    label: 'Moonshot · Kimi K2 Thinking',
  },
  { id: 'openrouter/moonshotai/kimi-k2.5', label: 'Moonshot · Kimi K2.5' },
];

export function guessModelLabel(modelId: string): string {
  const found = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (found) return found.label;

  const id = modelId.replace(/^openrouter\//, '');
  const [vendor, ...rest] = id.split('/');
  const provider = vendor
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
  return `${provider} · ${rest.join('/').replace(/-/g, ' ')}`;
}

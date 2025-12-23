// Pricing per 1M tokens (as of 2024)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export function calculateCost(model: string, usage: TokenUsage): CostResult {
  const pricing = PRICING[model] || DEFAULT_PRICING;

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

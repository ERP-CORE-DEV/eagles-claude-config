export const MODEL_PRICING = Object.freeze({
  "claude-opus-4-6": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4.0 },
  "kimi-k2-thinking": { inputPer1M: 0.6, outputPer1M: 2.5 },
  "deepseek-r1": { inputPer1M: 0.55, outputPer1M: 2.19 },
  "deepseek-v3": { inputPer1M: 0.27, outputPer1M: 1.1 },
  "codestral-2501": { inputPer1M: 0.3, outputPer1M: 0.9 },
} as const satisfies Record<
  string,
  { readonly inputPer1M: number; readonly outputPer1M: number }
>);

export type KnownModelName = keyof typeof MODEL_PRICING;

export const BUDGET_THRESHOLDS = Object.freeze({
  WARN_USD: 5.0,
  CRITICAL_USD: 20.0,
  HALT_USD: 50.0,
} as const);

export const CACHE_DISCOUNT = Object.freeze({
  READ_MULTIPLIER: 0.1,
  CREATE_MULTIPLIER: 1.25,
} as const);

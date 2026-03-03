export interface RunMetrics {
  readonly taskId: string;
  readonly system: "classic" | "advanced";
  readonly latencyMs: number;
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly toolCallCount: number;
  readonly success: boolean;
  readonly errorMessage: string | null;
  readonly collectedAt: string;
}

export interface ExtendedRunMetrics extends RunMetrics {
  readonly featureSupported: boolean;
  readonly dataGranularity: "none" | "session" | "per-wave" | "per-tool";
  readonly automationLevel: "manual" | "advisory" | "enforced";
}

export interface AggregateMetrics {
  readonly totalRuns: number;
  readonly successRate: number;
  readonly latency: PercentilesMs;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly avgCostPerTask: number;
  readonly featuresSupported: number;
  readonly totalTasks: number;
}

export interface PercentilesMs {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
}

export interface DimensionResult {
  readonly dimension: string;
  readonly classicTasks: number;
  readonly classicSuccesses: number;
  readonly advancedTasks: number;
  readonly advancedSuccesses: number;
  readonly classicSupported: boolean;
  readonly advancedSupported: boolean;
  readonly winner: "Classic" | "Advanced" | "Tie";
}

export interface FeatureGap {
  readonly capability: string;
  readonly classicMethod: string;
  readonly advancedMethod: string;
  readonly winner: "Classic" | "Advanced" | "Tie";
}

export function nearestRank(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

export function computePercentiles(values: readonly number[]): PercentilesMs {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
    mean: Math.round(mean * 100) / 100,
  };
}

export function aggregateMetrics(runs: readonly RunMetrics[]): AggregateMetrics {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      latency: { p50: 0, p95: 0, p99: 0, mean: 0 },
      totalTokens: 0,
      totalCostUsd: 0,
      avgCostPerTask: 0,
      featuresSupported: 0,
      totalTasks: 0,
    };
  }

  const successCount = runs.filter((r) => r.success).length;
  const latencies = runs.map((r) => r.latencyMs);
  const totalTokens = runs.reduce((sum, r) => sum + r.tokenCount, 0);
  const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);

  return {
    totalRuns: runs.length,
    successRate: successCount / runs.length,
    latency: computePercentiles(latencies),
    totalTokens,
    totalCostUsd: Math.round(totalCost * 1000) / 1000,
    avgCostPerTask: Math.round((totalCost / runs.length) * 1000) / 1000,
    featuresSupported: successCount,
    totalTasks: runs.length,
  };
}

export function aggregateExtendedMetrics(
  runs: readonly ExtendedRunMetrics[],
): AggregateMetrics {
  const base = aggregateMetrics(runs);
  const supported = runs.filter((r) => r.featureSupported).length;
  return { ...base, featuresSupported: supported };
}

export const FEATURE_GAPS: readonly FeatureGap[] = [
  {
    capability: "Memory Search",
    classicMethod: "Substring grep on MEMORY.md",
    advancedMethod: "Semantic vector search (384D embeddings)",
    winner: "Advanced",
  },
  {
    capability: "Token Tracking",
    classicMethod: "Session-end JSON batch write",
    advancedMethod: "Real-time per-tool SQLite ledger",
    winner: "Advanced",
  },
  {
    capability: "Budget Enforcement",
    classicMethod: "Advisory log warning (no blocking)",
    advancedMethod: "Enforced gate (WARN/CRITICAL/HALT thresholds)",
    winner: "Advanced",
  },
  {
    capability: "Drift Detection",
    classicMethod: "Not supported",
    advancedMethod: "5-metric composite scoring with alerts",
    winner: "Advanced",
  },
  {
    capability: "GDPR Erasure",
    classicMethod: "Manual file edit (no physical deletion)",
    advancedMethod: "Physical deletion + HNSW index rebuild",
    winner: "Advanced",
  },
];

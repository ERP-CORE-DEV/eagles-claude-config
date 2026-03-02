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

export interface AggregateMetrics {
  readonly totalRuns: number;
  readonly successRate: number;
  readonly latency: PercentilesMs;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly avgCostPerTask: number;
}

export interface PercentilesMs {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
}

export function computePercentiles(values: readonly number[]): PercentilesMs {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
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
  };
}

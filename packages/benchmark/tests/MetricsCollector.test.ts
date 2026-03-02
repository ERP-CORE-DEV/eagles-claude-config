import { describe, it, expect } from "vitest";
import {
  computePercentiles,
  aggregateMetrics,
  type RunMetrics,
} from "../src/metrics/MetricsCollector.js";

describe("computePercentiles", () => {
  it("should return zeros for empty array", () => {
    const result = computePercentiles([]);
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.mean).toBe(0);
  });

  it("should compute correct percentiles for sorted values", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = computePercentiles(values);

    expect(result.p50).toBe(51);
    expect(result.p95).toBe(96);
    expect(result.mean).toBeCloseTo(50.5, 0);
  });

  it("should handle single value", () => {
    const result = computePercentiles([42]);
    expect(result.p50).toBe(42);
    expect(result.mean).toBe(42);
  });
});

describe("aggregateMetrics", () => {
  it("should return zeros for empty runs", () => {
    const result = aggregateMetrics([]);
    expect(result.totalRuns).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("should aggregate runs correctly", () => {
    const runs: RunMetrics[] = [
      {
        taskId: "t1",
        system: "classic",
        latencyMs: 100,
        tokenCount: 1000,
        costUsd: 0.05,
        toolCallCount: 2,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      {
        taskId: "t2",
        system: "classic",
        latencyMs: 200,
        tokenCount: 2000,
        costUsd: 0.10,
        toolCallCount: 3,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      {
        taskId: "t3",
        system: "classic",
        latencyMs: 300,
        tokenCount: 500,
        costUsd: 0.02,
        toolCallCount: 1,
        success: false,
        errorMessage: "timeout",
        collectedAt: new Date().toISOString(),
      },
    ];

    const result = aggregateMetrics(runs);

    expect(result.totalRuns).toBe(3);
    expect(result.successRate).toBeCloseTo(0.667, 2);
    expect(result.totalTokens).toBe(3500);
    expect(result.totalCostUsd).toBe(0.17);
    expect(result.avgCostPerTask).toBeCloseTo(0.057, 2);
  });
});

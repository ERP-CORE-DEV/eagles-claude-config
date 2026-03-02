import { describe, it, expect } from "vitest";
import {
  computeDelta,
  generateMarkdownReport,
  type ComparisonReport,
} from "../src/reporters/MarkdownReporter.js";
import type { AggregateMetrics } from "../src/metrics/MetricsCollector.js";

const classicMetrics: AggregateMetrics = {
  totalRuns: 4,
  successRate: 1.0,
  latency: { p50: 100, p95: 200, p99: 250, mean: 150 },
  totalTokens: 10000,
  totalCostUsd: 0.5,
  avgCostPerTask: 0.125,
};

const advancedMetrics: AggregateMetrics = {
  totalRuns: 4,
  successRate: 1.0,
  latency: { p50: 80, p95: 160, p99: 200, mean: 120 },
  totalTokens: 8000,
  totalCostUsd: 0.3,
  avgCostPerTask: 0.075,
};

describe("computeDelta", () => {
  it("should compute percentage changes", () => {
    const delta = computeDelta(classicMetrics, advancedMetrics);

    expect(delta.costReduction).toBe("-40.0%");
    expect(delta.latencyReduction).toBe("-20.0%");
    expect(delta.tokenReduction).toBe("-20.0%");
    expect(delta.successRateDelta).toBe("+0.0%");
  });

  it("should handle zero base gracefully", () => {
    const zeroMetrics: AggregateMetrics = {
      ...classicMetrics,
      totalCostUsd: 0,
      latency: { p50: 0, p95: 0, p99: 0, mean: 0 },
      totalTokens: 0,
    };
    const delta = computeDelta(zeroMetrics, advancedMetrics);

    expect(delta.costReduction).toBe("N/A");
    expect(delta.latencyReduction).toBe("N/A");
  });
});

describe("generateMarkdownReport", () => {
  it("should generate valid markdown with summary table", () => {
    const report: ComparisonReport = {
      generatedAt: "2026-03-02T00:00:00Z",
      taskCount: 4,
      classic: classicMetrics,
      advanced: advancedMetrics,
      delta: computeDelta(classicMetrics, advancedMetrics),
    };

    const md = generateMarkdownReport(report);

    expect(md).toContain("# EAGLES Benchmark Report");
    expect(md).toContain("| Metric |");
    expect(md).toContain("$0.500");
    expect(md).toContain("$0.300");
    expect(md).toContain("Advanced wins on both cost and latency.");
  });

  it("should indicate Classic wins when Advanced is worse", () => {
    const worseAdvanced: AggregateMetrics = {
      ...advancedMetrics,
      totalCostUsd: 1.0,
      latency: { p50: 200, p95: 400, p99: 500, mean: 300 },
    };
    const report: ComparisonReport = {
      generatedAt: "2026-03-02T00:00:00Z",
      taskCount: 4,
      classic: classicMetrics,
      advanced: worseAdvanced,
      delta: computeDelta(classicMetrics, worseAdvanced),
    };

    const md = generateMarkdownReport(report);
    expect(md).toContain("Classic performs better");
  });
});

import { describe, it, expect } from "vitest";
import {
  computeDelta,
  generateMarkdownReport,
  type ComparisonReport,
} from "../src/reporters/MarkdownReporter.js";
import { FEATURE_GAPS, type AggregateMetrics } from "../src/metrics/MetricsCollector.js";

const classicMetrics: AggregateMetrics = {
  totalRuns: 4,
  successRate: 1.0,
  latency: { p50: 100, p95: 200, p99: 250, mean: 150 },
  totalTokens: 10000,
  totalCostUsd: 0.5,
  avgCostPerTask: 0.125,
  featuresSupported: 3,
  totalTasks: 4,
};

const advancedMetrics: AggregateMetrics = {
  totalRuns: 4,
  successRate: 1.0,
  latency: { p50: 80, p95: 160, p99: 200, mean: 120 },
  totalTokens: 8000,
  totalCostUsd: 0.3,
  avgCostPerTask: 0.075,
  featuresSupported: 4,
  totalTasks: 4,
};

function makeReport(
  classic: AggregateMetrics,
  advanced: AggregateMetrics,
): ComparisonReport {
  return {
    generatedAt: "2026-03-02T00:00:00Z",
    taskCount: 4,
    classic,
    advanced,
    delta: computeDelta(classic, advanced),
    dimensions: [
      { dimension: "Memory Retrieval", classicTasks: 1, classicSuccesses: 1, advancedTasks: 1, advancedSuccesses: 1, classicSupported: true, advancedSupported: true, winner: "Advanced" },
      { dimension: "Drift Detection", classicTasks: 1, classicSuccesses: 0, advancedTasks: 1, advancedSuccesses: 1, classicSupported: false, advancedSupported: true, winner: "Advanced" },
    ],
    featureGaps: FEATURE_GAPS,
    dummyProjectDescription: "Generic TypeScript REST API (8 requirements, 3 waves)",
  };
}

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
  it("should generate valid markdown with summary and feature gap tables", () => {
    const report = makeReport(classicMetrics, advancedMetrics);
    const md = generateMarkdownReport(report);

    expect(md).toContain("# EAGLES Benchmark Report");
    expect(md).toContain("| Metric |");
    expect(md).toContain("Feature Gap Analysis");
    expect(md).toContain("Memory Search");
    expect(md).toContain("Per-Dimension Results");
    expect(md).toContain("Advanced wins on 2/2 dimensions");
  });

  it("should handle dimensions where Classic wins", () => {
    const report: ComparisonReport = {
      ...makeReport(classicMetrics, advancedMetrics),
      dimensions: [
        { dimension: "Memory", classicTasks: 1, classicSuccesses: 1, advancedTasks: 1, advancedSuccesses: 0, classicSupported: true, advancedSupported: true, winner: "Classic" },
        { dimension: "Tokens", classicTasks: 1, classicSuccesses: 1, advancedTasks: 1, advancedSuccesses: 0, classicSupported: true, advancedSupported: true, winner: "Classic" },
      ],
    };
    const md = generateMarkdownReport(report);
    expect(md).toContain("Classic wins on 2/2 dimensions");
  });
});

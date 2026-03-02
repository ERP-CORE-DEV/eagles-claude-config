import type { AggregateMetrics, RunMetrics } from "../metrics/MetricsCollector.js";

export interface ComparisonReport {
  readonly generatedAt: string;
  readonly taskCount: number;
  readonly classic: AggregateMetrics;
  readonly advanced: AggregateMetrics;
  readonly delta: DeltaMetrics;
}

export interface DeltaMetrics {
  readonly costReduction: string;
  readonly latencyReduction: string;
  readonly successRateDelta: string;
  readonly tokenReduction: string;
}

export function computeDelta(
  classic: AggregateMetrics,
  advanced: AggregateMetrics,
): DeltaMetrics {
  const pctChange = (base: number, comparison: number): string => {
    if (base === 0) return "N/A";
    const delta = ((comparison - base) / base) * 100;
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}%`;
  };

  return {
    costReduction: pctChange(classic.totalCostUsd, advanced.totalCostUsd),
    latencyReduction: pctChange(classic.latency.mean, advanced.latency.mean),
    successRateDelta: pctChange(classic.successRate, advanced.successRate),
    tokenReduction: pctChange(classic.totalTokens, advanced.totalTokens),
  };
}

export function generateMarkdownReport(report: ComparisonReport): string {
  const lines: string[] = [
    "# EAGLES Benchmark Report",
    "",
    `**Generated**: ${report.generatedAt}`,
    `**Tasks**: ${report.taskCount}`,
    "",
    "## Summary",
    "",
    "| Metric | Classic | Advanced | Delta |",
    "|--------|---------|----------|-------|",
    `| Success Rate | ${(report.classic.successRate * 100).toFixed(0)}% | ${(report.advanced.successRate * 100).toFixed(0)}% | ${report.delta.successRateDelta} |`,
    `| Total Cost | $${report.classic.totalCostUsd.toFixed(3)} | $${report.advanced.totalCostUsd.toFixed(3)} | ${report.delta.costReduction} |`,
    `| Avg Cost/Task | $${report.classic.avgCostPerTask.toFixed(3)} | $${report.advanced.avgCostPerTask.toFixed(3)} | |`,
    `| Latency (mean) | ${report.classic.latency.mean}ms | ${report.advanced.latency.mean}ms | ${report.delta.latencyReduction} |`,
    `| Latency (p95) | ${report.classic.latency.p95}ms | ${report.advanced.latency.p95}ms | |`,
    `| Total Tokens | ${report.classic.totalTokens.toLocaleString()} | ${report.advanced.totalTokens.toLocaleString()} | ${report.delta.tokenReduction} |`,
    "",
    "## Verdict",
    "",
  ];

  const costBetter = report.advanced.totalCostUsd < report.classic.totalCostUsd;
  const latencyBetter = report.advanced.latency.mean < report.classic.latency.mean;

  if (costBetter && latencyBetter) {
    lines.push("Advanced wins on both cost and latency.");
  } else if (costBetter) {
    lines.push("Advanced is cheaper but slower.");
  } else if (latencyBetter) {
    lines.push("Advanced is faster but more expensive.");
  } else {
    lines.push("Classic performs better on both dimensions. Review Advanced configuration.");
  }

  return lines.join("\n");
}

export function generateJsonReport(
  classicRuns: readonly RunMetrics[],
  advancedRuns: readonly RunMetrics[],
  report: ComparisonReport,
): string {
  return JSON.stringify(
    {
      metadata: {
        generatedAt: report.generatedAt,
        taskCount: report.taskCount,
      },
      summary: report,
      rawRuns: {
        classic: classicRuns,
        advanced: advancedRuns,
      },
    },
    null,
    2,
  );
}

import type {
  AggregateMetrics,
  RunMetrics,
  ExtendedRunMetrics,
  DimensionResult,
  FeatureGap,
} from "../metrics/MetricsCollector.js";
import { FEATURE_GAPS } from "../metrics/MetricsCollector.js";
import type { TaskCategory } from "../tasks/TaskRegistry.js";

export interface ComparisonReport {
  readonly generatedAt: string;
  readonly taskCount: number;
  readonly classic: AggregateMetrics;
  readonly advanced: AggregateMetrics;
  readonly delta: DeltaMetrics;
  readonly dimensions: readonly DimensionResult[];
  readonly featureGaps: readonly FeatureGap[];
  readonly dummyProjectDescription: string;
}

export interface DeltaMetrics {
  readonly costReduction: string;
  readonly latencyReduction: string;
  readonly successRateDelta: string;
  readonly tokenReduction: string;
  readonly featureSupportDelta: string;
}

export function computeDelta(
  classic: AggregateMetrics,
  advanced: AggregateMetrics,
): DeltaMetrics {
  const pctChange = (base: number, comparison: number): string => {
    if (base === 0) return comparison === 0 ? "0.0%" : "N/A";
    const delta = ((comparison - base) / base) * 100;
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}%`;
  };

  return {
    costReduction: pctChange(classic.totalCostUsd, advanced.totalCostUsd),
    latencyReduction: pctChange(classic.latency.mean, advanced.latency.mean),
    successRateDelta: pctChange(classic.successRate, advanced.successRate),
    tokenReduction: pctChange(classic.totalTokens, advanced.totalTokens),
    featureSupportDelta: `${advanced.featuresSupported}/${advanced.totalTasks} vs ${classic.featuresSupported}/${classic.totalTasks}`,
  };
}

const DIMENSION_LABELS: Record<TaskCategory, string> = {
  "memory": "Memory Retrieval",
  "token-tracking": "Token Cost Tracking",
  "budget-enforcement": "Budget Enforcement",
  "drift-detection": "Drift Detection",
  "e2e-orchestration": "E2E Orchestration",
  "composite": "Composite",
};

export function computeDimensions(
  classicRuns: readonly ExtendedRunMetrics[],
  advancedRuns: readonly ExtendedRunMetrics[],
): DimensionResult[] {
  const categories: TaskCategory[] = [
    "memory",
    "token-tracking",
    "budget-enforcement",
    "drift-detection",
    "e2e-orchestration",
  ];

  return categories.map((cat) => {
    const cRuns = classicRuns.filter((r) => taskCategoryFromId(r.taskId) === cat);
    const aRuns = advancedRuns.filter((r) => taskCategoryFromId(r.taskId) === cat);
    const cSuccess = cRuns.filter((r) => r.success).length;
    const aSuccess = aRuns.filter((r) => r.success).length;
    const cSupported = cRuns.some((r) => r.featureSupported);
    const aSupported = aRuns.some((r) => r.featureSupported);

    let winner: "Classic" | "Advanced" | "Tie" = "Tie";
    if (aSuccess > cSuccess) winner = "Advanced";
    else if (cSuccess > aSuccess) winner = "Classic";
    else if (aSupported && !cSupported) winner = "Advanced";

    return {
      dimension: DIMENSION_LABELS[cat],
      classicTasks: cRuns.length,
      classicSuccesses: cSuccess,
      advancedTasks: aRuns.length,
      advancedSuccesses: aSuccess,
      classicSupported: cSupported,
      advancedSupported: aSupported,
      winner,
    };
  });
}

function taskCategoryFromId(taskId: string): TaskCategory {
  if (taskId.startsWith("memory")) return "memory";
  if (taskId.startsWith("token")) return "token-tracking";
  if (taskId.startsWith("budget")) return "budget-enforcement";
  if (taskId.startsWith("drift")) return "drift-detection";
  if (taskId.startsWith("e2e")) return "e2e-orchestration";
  return "composite";
}

export function generateMarkdownReport(report: ComparisonReport): string {
  const lines: string[] = [
    "# EAGLES Benchmark Report — Classic vs Advanced",
    "",
    `**Generated**: ${report.generatedAt}`,
    `**Dummy Project**: ${report.dummyProjectDescription}`,
    `**Tasks**: ${report.taskCount}`,
    "",
    "## Summary",
    "",
    "| Metric | Classic | Advanced | Delta |",
    "|--------|---------|----------|-------|",
    `| Tasks Completed | ${report.classic.featuresSupported}/${report.classic.totalTasks} | ${report.advanced.featuresSupported}/${report.advanced.totalTasks} | ${report.delta.featureSupportDelta} |`,
    `| Success Rate | ${(report.classic.successRate * 100).toFixed(0)}% | ${(report.advanced.successRate * 100).toFixed(0)}% | ${report.delta.successRateDelta} |`,
    `| Latency (mean) | ${report.classic.latency.mean}ms | ${report.advanced.latency.mean}ms | ${report.delta.latencyReduction} |`,
    `| Latency (p95) | ${report.classic.latency.p95}ms | ${report.advanced.latency.p95}ms | |`,
    "",
    "## Feature Gap Analysis",
    "",
    "| Capability | Classic | Advanced | Winner |",
    "|------------|---------|----------|--------|",
  ];

  for (const gap of report.featureGaps) {
    lines.push(`| ${gap.capability} | ${gap.classicMethod} | ${gap.advancedMethod} | ${gap.winner} |`);
  }

  lines.push("");
  lines.push("## Per-Dimension Results");
  lines.push("");
  lines.push("| Dimension | Classic (pass/total) | Advanced (pass/total) | Winner |");
  lines.push("|-----------|---------------------|----------------------|--------|");

  for (const dim of report.dimensions) {
    lines.push(
      `| ${dim.dimension} | ${dim.classicSuccesses}/${dim.classicTasks} | ${dim.advancedSuccesses}/${dim.advancedTasks} | ${dim.winner} |`,
    );
  }

  // Per-dimension detail sections
  for (const dim of report.dimensions) {
    lines.push("");
    lines.push(`### ${dim.dimension}`);
    lines.push("");
    lines.push(`- **Classic**: ${dim.classicSupported ? "Supported" : "NOT supported"} — ${dim.classicSuccesses}/${dim.classicTasks} tasks passed`);
    lines.push(`- **Advanced**: ${dim.advancedSupported ? "Supported" : "NOT supported"} — ${dim.advancedSuccesses}/${dim.advancedTasks} tasks passed`);
    lines.push(`- **Winner**: ${dim.winner}`);
  }

  lines.push("");
  lines.push("## Verdict");
  lines.push("");

  const advancedWins = report.dimensions.filter((d) => d.winner === "Advanced").length;
  const classicWins = report.dimensions.filter((d) => d.winner === "Classic").length;
  const totalDims = report.dimensions.length;

  if (advancedWins > classicWins) {
    lines.push(
      `**Advanced wins on ${advancedWins}/${totalDims} dimensions** with ${report.advanced.featuresSupported}/${report.advanced.totalTasks} task completion vs ${report.classic.featuresSupported}/${report.classic.totalTasks} for Classic.`,
    );
  } else if (classicWins > advancedWins) {
    lines.push(
      `Classic wins on ${classicWins}/${totalDims} dimensions. Review Advanced configuration.`,
    );
  } else {
    lines.push("Tie across dimensions. Both systems have comparable capabilities.");
  }

  lines.push("");

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
        dummyProject: report.dummyProjectDescription,
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

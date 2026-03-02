import { TASK_REGISTRY, type TaskSpec } from "../tasks/TaskRegistry.js";
import {
  aggregateMetrics,
  type RunMetrics,
  type AggregateMetrics,
} from "../metrics/MetricsCollector.js";
import {
  computeDelta,
  generateMarkdownReport,
  generateJsonReport,
  type ComparisonReport,
} from "../reporters/MarkdownReporter.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface BenchmarkResult {
  readonly taskId: string;
  readonly ranAt: string;
  readonly classic: RunMetrics | null;
  readonly advanced: RunMetrics | null;
}

export class BenchmarkOrchestrator {
  private readonly results: BenchmarkResult[] = [];

  constructor(
    private readonly classicRoot: string,
    private readonly advancedRoot: string,
  ) {}

  async runAll(): Promise<BenchmarkResult[]> {
    const tasks = TASK_REGISTRY;
    process.stderr.write(`[benchmark] Starting ${tasks.length} tasks\n`);
    process.stderr.write(`[benchmark] Classic: ${this.classicRoot}\n`);
    process.stderr.write(`[benchmark] Advanced: ${this.advancedRoot}\n`);
    process.stderr.write(`\n`);

    for (const task of tasks) {
      process.stderr.write(`[benchmark] Task: ${task.name} (${task.id})\n`);

      const classicRun = await this.runTask(task, "classic");
      const advancedRun = await this.runTask(task, "advanced");

      this.results.push({
        taskId: task.id,
        ranAt: new Date().toISOString(),
        classic: classicRun,
        advanced: advancedRun,
      });

      const cStatus = classicRun.success ? "PASS" : "FAIL";
      const aStatus = advancedRun.success ? "PASS" : "FAIL";
      process.stderr.write(
        `  Classic: ${cStatus} (${classicRun.latencyMs}ms, $${classicRun.costUsd})\n`,
      );
      process.stderr.write(
        `  Advanced: ${aStatus} (${advancedRun.latencyMs}ms, $${advancedRun.costUsd})\n`,
      );
    }

    this.writeReports();
    return this.results;
  }

  async runTask(
    task: TaskSpec,
    system: "classic" | "advanced",
  ): Promise<RunMetrics> {
    const startMs = Date.now();

    // Simulate task execution — in production, this would call MCP tools
    // via the MCP client SDK against the appropriate system's MCP servers
    const toolCallCount = task.steps.length;

    const latencyMs = Date.now() - startMs;

    return {
      taskId: task.id,
      system,
      latencyMs,
      tokenCount: 0,
      costUsd: 0,
      toolCallCount,
      success: true,
      errorMessage: null,
      collectedAt: new Date().toISOString(),
    };
  }

  private writeReports(): void {
    const classicRuns = this.results
      .filter((r) => r.classic)
      .map((r) => r.classic!);
    const advancedRuns = this.results
      .filter((r) => r.advanced)
      .map((r) => r.advanced!);

    const classicAgg = aggregateMetrics(classicRuns);
    const advancedAgg = aggregateMetrics(advancedRuns);
    const delta = computeDelta(classicAgg, advancedAgg);

    const report: ComparisonReport = {
      generatedAt: new Date().toISOString(),
      taskCount: this.results.length,
      classic: classicAgg,
      advanced: advancedAgg,
      delta,
    };

    const outDir = join(this.advancedRoot, "benchmark-results");
    mkdirSync(outDir, { recursive: true });

    const markdown = generateMarkdownReport(report);
    writeFileSync(join(outDir, "BENCHMARK_REPORT.md"), markdown, "utf-8");

    const json = generateJsonReport(classicRuns, advancedRuns, report);
    writeFileSync(join(outDir, "benchmark-data.json"), json, "utf-8");

    process.stderr.write(`\n[benchmark] Reports written to ${outDir}\n`);
    process.stderr.write(`[benchmark] ${markdown}\n`);
  }
}

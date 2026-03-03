import { TASK_REGISTRY, type TaskSpec } from "../tasks/TaskRegistry.js";
import {
  aggregateExtendedMetrics,
  FEATURE_GAPS,
  type ExtendedRunMetrics,
} from "../metrics/MetricsCollector.js";
import {
  computeDelta,
  computeDimensions,
  generateMarkdownReport,
  generateJsonReport,
  type ComparisonReport,
} from "../reporters/MarkdownReporter.js";
import type { TaskRunner, TaskResult, DummyProjectInfo } from "../runners/types.js";
import { ClassicSimulator } from "../runners/ClassicSimulator.js";
import { AdvancedRunner } from "../runners/AdvancedRunner.js";
import { createDummyProject } from "../project/DummyProject.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface BenchmarkResult {
  readonly taskId: string;
  readonly ranAt: string;
  readonly classic: TaskResult;
  readonly advanced: TaskResult;
}

export class BenchmarkOrchestrator {
  private readonly results: BenchmarkResult[] = [];
  private project: DummyProjectInfo | null = null;
  private classicRunner: TaskRunner | null = null;
  private advancedRunner: TaskRunner | null = null;

  constructor(
    private readonly outputRoot: string,
  ) {}

  async runAll(): Promise<BenchmarkResult[]> {
    const tasks = TASK_REGISTRY;

    process.stderr.write(`[benchmark] Creating dummy TypeScript REST API project...\n`);
    this.project = createDummyProject();
    process.stderr.write(`[benchmark] Project: ${this.project.rootDir}\n`);
    process.stderr.write(`[benchmark] Requirements: ${this.project.requirements.length}\n`);
    process.stderr.write(`[benchmark] Waves: ${this.project.waves.length}\n`);
    process.stderr.write(`[benchmark] Tasks: ${tasks.length}\n\n`);

    // Initialize runners
    this.classicRunner = new ClassicSimulator(this.project);
    this.advancedRunner = new AdvancedRunner(this.project);

    await this.classicRunner.init();
    process.stderr.write(`[benchmark] Classic runner initialized\n`);

    await this.advancedRunner.init();
    process.stderr.write(`[benchmark] Advanced runner initialized\n\n`);

    for (const task of tasks) {
      process.stderr.write(`[benchmark] Task: ${task.name} (${task.id})\n`);

      const classicResult = await this.classicRunner.execute(task);
      const advancedResult = await this.advancedRunner.execute(task);

      this.results.push({
        taskId: task.id,
        ranAt: new Date().toISOString(),
        classic: classicResult,
        advanced: advancedResult,
      });

      const cStatus = classicResult.metrics.success ? "PASS" : "FAIL";
      const aStatus = advancedResult.metrics.success ? "PASS" : "FAIL";
      const cSupported = classicResult.featureSupported ? "" : " [UNSUPPORTED]";
      const aSupported = advancedResult.featureSupported ? "" : " [UNSUPPORTED]";
      process.stderr.write(`  Classic:   ${cStatus}${cSupported} (${classicResult.metrics.latencyMs}ms)\n`);
      process.stderr.write(`  Advanced:  ${aStatus}${aSupported} (${advancedResult.metrics.latencyMs}ms)\n`);
    }

    // Cleanup
    await this.classicRunner.cleanup();
    await this.advancedRunner.cleanup();

    this.writeReports();
    return this.results;
  }

  private writeReports(): void {
    const classicExtended: ExtendedRunMetrics[] = this.results.map((r) => ({
      ...r.classic.metrics,
      featureSupported: r.classic.featureSupported,
      dataGranularity: r.classic.dataGranularity,
      automationLevel: r.classic.automationLevel,
    }));

    const advancedExtended: ExtendedRunMetrics[] = this.results.map((r) => ({
      ...r.advanced.metrics,
      featureSupported: r.advanced.featureSupported,
      dataGranularity: r.advanced.dataGranularity,
      automationLevel: r.advanced.automationLevel,
    }));

    const classicAgg = aggregateExtendedMetrics(classicExtended);
    const advancedAgg = aggregateExtendedMetrics(advancedExtended);
    const delta = computeDelta(classicAgg, advancedAgg);
    const dimensions = computeDimensions(classicExtended, advancedExtended);

    const report: ComparisonReport = {
      generatedAt: new Date().toISOString(),
      taskCount: this.results.length,
      classic: classicAgg,
      advanced: advancedAgg,
      delta,
      dimensions,
      featureGaps: FEATURE_GAPS,
      dummyProjectDescription: "Generic TypeScript REST API (8 requirements, 3 waves, 20 tests)",
    };

    const outDir = join(this.outputRoot, "benchmark-results");
    mkdirSync(outDir, { recursive: true });

    const markdown = generateMarkdownReport(report);
    writeFileSync(join(outDir, "BENCHMARK_REPORT.md"), markdown, "utf-8");

    const classicRuns = this.results.map((r) => r.classic.metrics);
    const advancedRuns = this.results.map((r) => r.advanced.metrics);
    const json = generateJsonReport(classicRuns, advancedRuns, report);
    writeFileSync(join(outDir, "benchmark-data.json"), json, "utf-8");

    process.stderr.write(`\n[benchmark] Reports written to ${outDir}\n`);
    process.stderr.write(`\n${markdown}\n`);
  }
}

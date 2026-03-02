// Orchestrates benchmark runs comparing Classic vs Advanced.
// Each run executes the same task against both systems and collects metrics.

export interface BenchmarkResult {
  readonly taskId: string;
  readonly ranAt: string;
  readonly classic: RunResult | null;
  readonly advanced: RunResult | null;
  readonly classicError: string | null;
  readonly advancedError: string | null;
}

export interface RunResult {
  readonly latencyMs: number;
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly accuracy: number;
}

export class BenchmarkOrchestrator {
  constructor(
    private readonly classicRoot: string,
    private readonly advancedRoot: string,
  ) {}

  async runAll(): Promise<BenchmarkResult[]> {
    // TODO: Phase 5 — Load tasks from registry, run each against both systems
    process.stderr.write(
      `[benchmark] Classic root: ${this.classicRoot}\n`,
    );
    process.stderr.write(
      `[benchmark] Advanced root: ${this.advancedRoot}\n`,
    );
    return [];
  }
}

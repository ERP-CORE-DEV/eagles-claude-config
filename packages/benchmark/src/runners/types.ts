import type { RunMetrics } from "../metrics/MetricsCollector.js";
import type { TaskSpec } from "../tasks/TaskRegistry.js";

export interface TaskResult {
  readonly metrics: RunMetrics;
  readonly featureSupported: boolean;
  readonly dataGranularity: "none" | "session" | "per-wave" | "per-tool";
  readonly automationLevel: "manual" | "advisory" | "enforced";
  readonly detail: Record<string, unknown>;
}

export interface TaskRunner {
  readonly systemName: "classic" | "advanced";
  init(): Promise<void>;
  execute(task: TaskSpec): Promise<TaskResult>;
  cleanup(): Promise<void>;
}

export interface WaveData {
  readonly waveNumber: number;
  readonly filesCreated: readonly string[];
  readonly filesModified: readonly string[];
  readonly testsTotal: number;
  readonly testsPassing: number;
  readonly testsFailing: number;
  readonly requirementsAddressed: readonly string[];
  readonly linesAdded: number;
  readonly unplannedFiles: readonly string[];
}

export interface DummyProjectInfo {
  readonly rootDir: string;
  readonly requirements: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly waves: readonly WaveData[];
}

import type { TaskRunner, TaskResult, DummyProjectInfo } from "./types.js";
import type { TaskSpec } from "../tasks/TaskRegistry.js";

/**
 * Simulates EAGLES Classic behavior using flat-file, grep-based approaches.
 * Classic = MEMORY.md + grep, session-level JSON for cost, advisory budget, no drift.
 */
export class ClassicSimulator implements TaskRunner {
  readonly systemName = "classic" as const;

  private readonly memoryStore: string[] = [];
  private sessionCost = 0;
  private readonly project: DummyProjectInfo;

  constructor(project: DummyProjectInfo) {
    this.project = project;
  }

  async init(): Promise<void> {
    // Classic has no initialization — flat files only
  }

  async execute(task: TaskSpec): Promise<TaskResult> {
    const startMs = Date.now();
    const handler = this.handlers[task.category];

    if (!handler) {
      return this.unsupportedResult(task, startMs);
    }

    return handler(task, startMs);
  }

  async cleanup(): Promise<void> {
    this.memoryStore.length = 0;
    this.sessionCost = 0;
  }

  private readonly handlers: Record<
    string,
    ((task: TaskSpec, startMs: number) => TaskResult) | undefined
  > = {
    "memory": (task, startMs) => this.handleMemory(task, startMs),
    "token-tracking": (task, startMs) => this.handleTokenTracking(task, startMs),
    "budget-enforcement": (task, startMs) => this.handleBudget(task, startMs),
    "drift-detection": (_task, startMs) => this.handleDrift(startMs),
    "e2e-orchestration": (task, startMs) => this.handleOrchestration(task, startMs),
    "composite": (task, startMs) => this.handleTokenTracking(task, startMs),
  };

  private handleMemory(task: TaskSpec, startMs: number): TaskResult {
    let matchCount = 0;

    for (const step of task.steps) {
      if (step.tool === "memory_store") {
        const text = step.arguments["text"] as string;
        this.memoryStore.push(text);
      }
      if (step.tool === "memory_search") {
        const query = step.arguments["query"] as string;
        const words = query.toLowerCase().split(/\s+/);
        matchCount = this.memoryStore.filter((m) =>
          words.some((w) => m.toLowerCase().includes(w)),
        ).length;
      }
      if (step.tool === "memory_forget") {
        // Classic: manual edit of MEMORY.md — no GDPR-compliant physical deletion
        const ids = step.arguments["ids"] as string[];
        for (const id of ids) {
          const idx = this.memoryStore.indexOf(id);
          if (idx >= 0) this.memoryStore.splice(idx, 1);
        }
      }
      if (step.tool === "memory_stats") {
        // Classic: count lines in MEMORY.md
      }
    }

    return {
      metrics: {
        taskId: task.id,
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: task.steps.length,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: true,
      dataGranularity: "none",
      automationLevel: "manual",
      detail: {
        method: "substring-grep",
        matchCount,
        totalStored: this.memoryStore.length,
      },
    };
  }

  private handleTokenTracking(task: TaskSpec, startMs: number): TaskResult {
    for (const step of task.steps) {
      if (step.tool === "record_token_usage") {
        const prompt = (step.arguments["promptTokens"] as number) ?? 0;
        const completion = (step.arguments["completionTokens"] as number) ?? 0;
        this.sessionCost += (prompt * 3 + completion * 15) / 1_000_000;
      }
    }

    return {
      metrics: {
        taskId: task.id,
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: task.steps.length,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: true,
      dataGranularity: "session",
      automationLevel: "manual",
      detail: {
        method: "session-end-json",
        totalCost: this.sessionCost,
        granularity: "session-level only",
      },
    };
  }

  private handleBudget(_task: TaskSpec, startMs: number): TaskResult {
    return {
      metrics: {
        taskId: _task.id,
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: _task.steps.length,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: true,
      dataGranularity: "session",
      automationLevel: "advisory",
      detail: {
        method: "log-warning",
        enforcement: "none",
        thresholds: "advisory only — no blocking",
      },
    };
  }

  private handleDrift(startMs: number): TaskResult {
    return {
      metrics: {
        taskId: "drift-*",
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: 0,
        success: false,
        errorMessage: "Drift detection not supported in Classic",
        collectedAt: new Date().toISOString(),
      },
      featureSupported: false,
      dataGranularity: "none",
      automationLevel: "manual",
      detail: {
        method: "unsupported",
        reason: "Classic has no drift detection capability",
      },
    };
  }

  private handleOrchestration(task: TaskSpec, startMs: number): TaskResult {
    return {
      metrics: {
        taskId: task.id,
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: task.steps.length,
        success: true,
        errorMessage: null,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: true,
      dataGranularity: "session",
      automationLevel: "manual",
      detail: {
        method: "manual-steps",
        automationSteps: 0,
        crossMcpDataFlow: false,
      },
    };
  }

  private unsupportedResult(task: TaskSpec, startMs: number): TaskResult {
    return {
      metrics: {
        taskId: task.id,
        system: "classic",
        latencyMs: Date.now() - startMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount: 0,
        success: false,
        errorMessage: `Category "${task.category}" not supported in Classic`,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: false,
      dataGranularity: "none",
      automationLevel: "manual",
      detail: {},
    };
  }
}

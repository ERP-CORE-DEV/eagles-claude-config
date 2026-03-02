import { createHash } from "node:crypto";

export interface TaskSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: "memory" | "token-tracking" | "drift-detection" | "composite";
  readonly difficulty: "basic" | "standard" | "advanced";
  readonly steps: readonly TaskStep[];
  readonly expectedOutcome: string;
  readonly contentHash: string;
}

export interface TaskStep {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
  readonly expectation: string;
}

function hashSpec(spec: Omit<TaskSpec, "contentHash">): string {
  const content = JSON.stringify({ steps: spec.steps, expectedOutcome: spec.expectedOutcome });
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function createTask(partial: Omit<TaskSpec, "contentHash">): TaskSpec {
  return { ...partial, contentHash: hashSpec(partial) };
}

export const TASK_REGISTRY: readonly TaskSpec[] = [
  createTask({
    id: "memory-store-search",
    name: "Store and Retrieve Memory",
    description: "Store a pattern memory, then search for it by semantic query",
    category: "memory",
    difficulty: "basic",
    steps: [
      {
        tool: "memory_store",
        arguments: {
          text: "Always use pnpm for monorepo management in EAGLES projects",
          project: "eagles-advanced",
          tags: ["pattern"],
          confidence: 0.95,
        },
        expectation: "success=true",
      },
      {
        tool: "memory_search",
        arguments: { query: "package manager for monorepos", topK: 3 },
        expectation: "results.length >= 1 AND results[0].score > 0.5",
      },
    ],
    expectedOutcome: "Stored memory is retrievable by semantic search with score > 0.5",
  }),
  createTask({
    id: "token-record-budget",
    name: "Record Usage and Check Budget",
    description: "Record token usage for a session, then verify budget status",
    category: "token-tracking",
    difficulty: "basic",
    steps: [
      {
        tool: "record_token_usage",
        arguments: {
          sessionId: "bench-session-1",
          modelName: "claude-sonnet-4-6",
          promptTokens: 50000,
          completionTokens: 25000,
        },
        expectation: "estimatedCostUsd > 0",
      },
      {
        tool: "get_budget_status",
        arguments: { windowDays: 1 },
        expectation: "status=ok AND totalCostUsd > 0",
      },
    ],
    expectedOutcome: "Budget correctly reflects recorded token usage",
  }),
  createTask({
    id: "drift-full-cycle",
    name: "Full Drift Detection Cycle",
    description: "Set requirements, record checkpoint, compute drift score",
    category: "drift-detection",
    difficulty: "standard",
    steps: [
      {
        tool: "drift_set_requirements",
        arguments: {
          sessionId: "bench-drift-1",
          title: "Benchmark Feature",
          requirementsText: "- [ ] Add login page\n- [ ] Add logout button\n- [ ] Write unit tests",
          plannedFiles: ["src/login.ts", "src/logout.ts", "tests/login.test.ts"],
          initialTestCount: 0,
        },
        expectation: "checklistItemsParsed >= 3",
      },
      {
        tool: "drift_checkpoint",
        arguments: {
          sessionId: "bench-drift-1",
          waveNumber: 1,
          filesModified: ["src/login.ts"],
          testsTotal: 5,
          testsPassing: 5,
          requirementsAddressed: ["Add login page"],
          linesAdded: 150,
          newFilesCreated: ["src/login.ts", "tests/login.test.ts"],
        },
        expectation: "snapshotAt is defined",
      },
      {
        tool: "drift_compare",
        arguments: { sessionId: "bench-drift-1", waveNumber: 1 },
        expectation: "driftScore >= 0 AND driftScore <= 1.0",
      },
    ],
    expectedOutcome: "Drift score computed between 0.0 and 1.0 with valid verdict",
  }),
  createTask({
    id: "model-routing",
    name: "Budget-Aware Model Routing",
    description: "Test model routing recommendations at different budget levels",
    category: "token-tracking",
    difficulty: "standard",
    steps: [
      {
        tool: "route_by_budget",
        arguments: { requiredCapabilityLevel: "basic" },
        expectation: "recommended is defined",
      },
      {
        tool: "route_by_budget",
        arguments: { requiredCapabilityLevel: "advanced" },
        expectation: "recommended is defined",
      },
    ],
    expectedOutcome: "Model routing returns valid recommendations for all capability levels",
  }),
] as const;

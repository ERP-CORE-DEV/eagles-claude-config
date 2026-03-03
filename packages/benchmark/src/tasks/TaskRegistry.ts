import { createHash } from "node:crypto";

export type TaskCategory =
  | "memory"
  | "token-tracking"
  | "budget-enforcement"
  | "drift-detection"
  | "e2e-orchestration"
  | "composite";

export interface TaskSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: TaskCategory;
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

// ---------------------------------------------------------------------------
// Dimension 1: Memory Retrieval (3 tasks)
// ---------------------------------------------------------------------------
const memoryStoreSearch = createTask({
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
});

const memoryMultiPattern = createTask({
  id: "memory-multi-pattern",
  name: "Multi-Pattern Memory Recall",
  description: "Store 5 diverse patterns and query with cross-domain search terms",
  category: "memory",
  difficulty: "standard",
  steps: [
    {
      tool: "memory_store",
      arguments: { text: "JWT tokens should expire after 1 hour for security", project: "bench", tags: ["lesson"], confidence: 0.9 },
      expectation: "success=true",
    },
    {
      tool: "memory_store",
      arguments: { text: "Use bcrypt with 12 salt rounds for password hashing", project: "bench", tags: ["pattern"], confidence: 0.95 },
      expectation: "success=true",
    },
    {
      tool: "memory_store",
      arguments: { text: "Express validation middleware should check Content-Type headers", project: "bench", tags: ["pattern"], confidence: 0.85 },
      expectation: "success=true",
    },
    {
      tool: "memory_store",
      arguments: { text: "Rate limiting prevents DDoS attacks on public endpoints", project: "bench", tags: ["lesson"], confidence: 0.8 },
      expectation: "success=true",
    },
    {
      tool: "memory_store",
      arguments: { text: "CORS headers must whitelist specific origins in production", project: "bench", tags: ["pattern"], confidence: 0.9 },
      expectation: "success=true",
    },
    {
      tool: "memory_search",
      arguments: { query: "authentication best practices", topK: 5, minScore: 0 },
      expectation: "count >= 1",
    },
    {
      tool: "memory_search",
      arguments: { query: "how to protect API endpoints from abuse", topK: 5, minScore: 0 },
      expectation: "count >= 1",
    },
  ],
  expectedOutcome: "Semantic search recalls relevant patterns across different security domains",
});

const memoryGdprForget = createTask({
  id: "memory-gdpr-forget",
  name: "GDPR Right to Erasure",
  description: "Store a memory, then forget it and verify physical deletion + index rebuild",
  category: "memory",
  difficulty: "standard",
  steps: [
    {
      tool: "memory_store",
      arguments: { text: "User PII pattern to be forgotten", project: "gdpr-test", tags: ["lesson"], confidence: 1.0 },
      expectation: "success=true AND id is defined",
    },
    {
      tool: "memory_stats",
      arguments: {},
      expectation: "totalMemories >= 1",
    },
    {
      tool: "memory_forget",
      arguments: { ids: ["__DYNAMIC_ID__"], reason: "GDPR Article 17 erasure request" },
      expectation: "indexRebuilt=true",
    },
  ],
  expectedOutcome: "Memory physically deleted with index rebuilt for GDPR compliance",
});

// ---------------------------------------------------------------------------
// Dimension 2: Token Cost Tracking (2 tasks)
// ---------------------------------------------------------------------------
const tokenRecordBudget = createTask({
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
});

const tokenPerWaveCosts = createTask({
  id: "token-per-wave-costs",
  name: "Per-Wave Cost Breakdown",
  description: "Record usage across 3 waves, then retrieve per-wave cost breakdown",
  category: "token-tracking",
  difficulty: "standard",
  steps: [
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-wave-session", modelName: "claude-sonnet-4-6", promptTokens: 20000, completionTokens: 10000, waveNumber: 1 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-wave-session", modelName: "claude-sonnet-4-6", promptTokens: 35000, completionTokens: 18000, waveNumber: 2 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-wave-session", modelName: "claude-haiku-4-5", promptTokens: 15000, completionTokens: 8000, waveNumber: 3 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "get_wave_costs",
      arguments: { sessionId: "bench-wave-session" },
      expectation: "waves.length >= 3",
    },
    {
      tool: "get_session_cost",
      arguments: { sessionId: "bench-wave-session" },
      expectation: "totalCostUsd > 0",
    },
  ],
  expectedOutcome: "Per-wave costs tracked with session total matching sum of waves",
});

// ---------------------------------------------------------------------------
// Dimension 3: Budget Enforcement (2 tasks)
// ---------------------------------------------------------------------------
const budgetThresholds = createTask({
  id: "budget-threshold-detection",
  name: "Budget Threshold Detection",
  description: "Push spending past WARN and CRITICAL thresholds, verify detection",
  category: "budget-enforcement",
  difficulty: "standard",
  steps: [
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-budget", modelName: "claude-opus-4-6", promptTokens: 200000, completionTokens: 50000, waveNumber: 1 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "get_budget_status",
      arguments: { windowDays: 1 },
      expectation: "status=warn",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-budget", modelName: "claude-opus-4-6", promptTokens: 800000, completionTokens: 200000, waveNumber: 2 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "get_budget_status",
      arguments: { windowDays: 1 },
      expectation: "status=critical",
    },
  ],
  expectedOutcome: "Budget status transitions from ok to warn to critical as spending increases",
});

const budgetModelRouting = createTask({
  id: "budget-model-routing",
  name: "Budget-Aware Model Routing",
  description: "Test model routing recommendations at different budget levels",
  category: "budget-enforcement",
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
});

// ---------------------------------------------------------------------------
// Dimension 4: Drift Detection (3 tasks)
// ---------------------------------------------------------------------------
const driftFullCycle = createTask({
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
        title: "Benchmark REST API",
        requirementsText: "- [ ] Create user CRUD endpoints (GET, POST, PUT, DELETE)\n- [ ] Add input validation middleware\n- [ ] Implement JWT authentication\n- [ ] Add password hashing with bcrypt\n- [ ] Write unit tests for user endpoints\n- [ ] Write unit tests for auth endpoints\n- [ ] Add rate limiting middleware\n- [ ] Configure CORS headers",
        plannedFiles: ["src/server.ts", "src/routes/users.ts", "src/routes/auth.ts", "src/middleware/validate.ts", "src/utils/hash.ts", "tests/users.test.ts", "tests/auth.test.ts", "tests/validate.test.ts"],
        initialTestCount: 0,
      },
      expectation: "checklistItemsParsed >= 8",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-drift-1",
        waveNumber: 1,
        filesModified: ["src/server.ts", "src/routes/users.ts"],
        testsTotal: 8,
        testsPassing: 8,
        requirementsAddressed: ["Create user CRUD endpoints (GET, POST, PUT, DELETE)", "Write unit tests for user endpoints"],
        linesAdded: 120,
        newFilesCreated: ["src/server.ts", "src/routes/users.ts", "tests/users.test.ts"],
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
});

const driftThreeWaveTrajectory = createTask({
  id: "drift-three-wave-trajectory",
  name: "3-Wave Drift Trajectory",
  description: "Simulate full 3-wave development and track drift trajectory",
  category: "drift-detection",
  difficulty: "advanced",
  steps: [
    {
      tool: "drift_set_requirements",
      arguments: {
        sessionId: "bench-drift-3wave",
        title: "3-Wave REST API",
        requirementsText: "- [ ] Create user CRUD endpoints\n- [ ] Add input validation\n- [ ] Implement JWT auth\n- [ ] Add password hashing\n- [ ] Write user tests\n- [ ] Write auth tests\n- [ ] Add rate limiting\n- [ ] Configure CORS",
        plannedFiles: ["src/server.ts", "src/routes/users.ts", "src/routes/auth.ts", "src/middleware/validate.ts", "src/utils/hash.ts", "tests/users.test.ts", "tests/auth.test.ts", "tests/validate.test.ts"],
        initialTestCount: 0,
      },
      expectation: "checklistItemsParsed >= 8",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-drift-3wave",
        waveNumber: 1,
        filesModified: ["src/server.ts", "src/routes/users.ts"],
        testsTotal: 8, testsPassing: 8,
        requirementsAddressed: ["Create user CRUD endpoints", "Write user tests"],
        linesAdded: 120,
        newFilesCreated: ["src/server.ts", "src/routes/users.ts", "tests/users.test.ts"],
      },
      expectation: "snapshotAt is defined",
    },
    {
      tool: "drift_compare",
      arguments: { sessionId: "bench-drift-3wave", waveNumber: 1 },
      expectation: "verdict is SYNCED or WARNING",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-drift-3wave",
        waveNumber: 2,
        filesModified: ["src/server.ts", "src/routes/auth.ts", "src/middleware/validate.ts"],
        testsTotal: 15, testsPassing: 15,
        requirementsAddressed: ["Implement JWT auth", "Add input validation", "Write auth tests"],
        linesAdded: 180,
        newFilesCreated: ["src/routes/auth.ts", "src/middleware/validate.ts", "tests/auth.test.ts", "src/middleware/logger.ts"],
      },
      expectation: "snapshotAt is defined",
    },
    {
      tool: "drift_compare",
      arguments: { sessionId: "bench-drift-3wave", waveNumber: 2 },
      expectation: "driftScore >= 0",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-drift-3wave",
        waveNumber: 3,
        filesModified: ["src/utils/hash.ts"],
        testsTotal: 20, testsPassing: 19,
        requirementsAddressed: ["Add password hashing"],
        linesAdded: 90,
        newFilesCreated: ["src/utils/hash.ts", "tests/validate.test.ts"],
      },
      expectation: "snapshotAt is defined",
    },
    {
      tool: "drift_compare",
      arguments: { sessionId: "bench-drift-3wave", waveNumber: 3 },
      expectation: "driftScore < previous wave (regression detected)",
    },
    {
      tool: "drift_report",
      arguments: { sessionId: "bench-drift-3wave", includeRecommendations: true },
      expectation: "totalWaves=3 AND recommendations.length > 0",
    },
  ],
  expectedOutcome: "Drift trajectory shows degradation from scope creep and regression",
});

const driftAlertEscalation = createTask({
  id: "drift-alert-escalation",
  name: "Drift Alert Escalation",
  description: "Trigger drift alerts at WARNING and BLOCK levels",
  category: "drift-detection",
  difficulty: "standard",
  steps: [
    {
      tool: "drift_set_requirements",
      arguments: {
        sessionId: "bench-drift-alert",
        title: "Alert Test",
        requirementsText: "- [ ] Req A\n- [ ] Req B\n- [ ] Req C\n- [ ] Req D\n- [ ] Req E",
        plannedFiles: ["a.ts", "b.ts", "c.ts"],
        initialTestCount: 0,
      },
      expectation: "checklistItemsParsed >= 5",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-drift-alert",
        waveNumber: 1,
        filesModified: ["a.ts"],
        testsTotal: 3, testsPassing: 1,
        requirementsAddressed: ["Req A"],
        linesAdded: 50,
        newFilesCreated: ["a.ts", "x.ts", "y.ts", "z.ts"],
      },
      expectation: "snapshotAt is defined",
    },
    {
      tool: "drift_compare",
      arguments: { sessionId: "bench-drift-alert", waveNumber: 1 },
      expectation: "driftScore < 0.6",
    },
    {
      tool: "drift_alert",
      arguments: { sessionId: "bench-drift-alert", waveNumber: 1 },
      expectation: "alertLevel is WARNING or BLOCK",
    },
  ],
  expectedOutcome: "Drift alert fires when score drops below warning threshold",
});

// ---------------------------------------------------------------------------
// Dimension 5: End-to-End Orchestration (2 tasks)
// ---------------------------------------------------------------------------
const e2ePipeline = createTask({
  id: "e2e-full-pipeline",
  name: "Full MCP Pipeline",
  description: "Store memories + track tokens + detect drift in one sequence",
  category: "e2e-orchestration",
  difficulty: "advanced",
  steps: [
    {
      tool: "memory_store",
      arguments: { text: "Always validate JWT expiry before trusting claims", project: "bench-e2e", tags: ["lesson"], confidence: 0.95 },
      expectation: "success=true",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-e2e", modelName: "claude-sonnet-4-6", promptTokens: 12000, completionTokens: 6000, waveNumber: 1 },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "drift_set_requirements",
      arguments: {
        sessionId: "bench-e2e",
        title: "E2E Pipeline Test",
        requirementsText: "- [ ] Store lesson\n- [ ] Track cost\n- [ ] Detect drift",
        plannedFiles: ["pipeline.ts"],
        initialTestCount: 0,
      },
      expectation: "checklistItemsParsed >= 3",
    },
    {
      tool: "drift_checkpoint",
      arguments: {
        sessionId: "bench-e2e",
        waveNumber: 1,
        filesModified: ["pipeline.ts"],
        testsTotal: 3, testsPassing: 3,
        requirementsAddressed: ["Store lesson", "Track cost", "Detect drift"],
        linesAdded: 50,
        newFilesCreated: ["pipeline.ts"],
      },
      expectation: "snapshotAt is defined",
    },
    {
      tool: "drift_compare",
      arguments: { sessionId: "bench-e2e", waveNumber: 1 },
      expectation: "driftScore > 0.7",
    },
    {
      tool: "get_budget_status",
      arguments: { windowDays: 1 },
      expectation: "totalCostUsd > 0",
    },
    {
      tool: "memory_search",
      arguments: { query: "JWT token validation", topK: 3, minScore: 0 },
      expectation: "count >= 0",
    },
  ],
  expectedOutcome: "All 3 MCP servers work together in orchestrated pipeline",
});

const e2eCostReport = createTask({
  id: "e2e-cost-report",
  name: "Cost Report Generation",
  description: "Record multi-model usage and generate comprehensive cost report",
  category: "e2e-orchestration",
  difficulty: "standard",
  steps: [
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-report", modelName: "claude-opus-4-6", promptTokens: 100000, completionTokens: 30000, waveNumber: 1, agentName: "planner" },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-report", modelName: "claude-sonnet-4-6", promptTokens: 200000, completionTokens: 100000, waveNumber: 2, agentName: "codegen" },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "record_token_usage",
      arguments: { sessionId: "bench-report", modelName: "claude-haiku-4-5", promptTokens: 50000, completionTokens: 25000, waveNumber: 3, agentName: "reviewer" },
      expectation: "estimatedCostUsd > 0",
    },
    {
      tool: "get_cost_report",
      arguments: { windowDays: 1 },
      expectation: "totalCostUsd > 0 AND modelBreakdown is defined",
    },
    {
      tool: "get_agent_costs",
      arguments: { sessionId: "bench-report" },
      expectation: "agents.length >= 3",
    },
  ],
  expectedOutcome: "Cost report shows per-model and per-agent breakdown with accurate totals",
});

export const TASK_REGISTRY: readonly TaskSpec[] = [
  memoryStoreSearch,
  memoryMultiPattern,
  memoryGdprForget,
  tokenRecordBudget,
  tokenPerWaveCosts,
  budgetThresholds,
  budgetModelRouting,
  driftFullCycle,
  driftThreeWaveTrajectory,
  driftAlertEscalation,
  e2ePipeline,
  e2eCostReport,
] as const;

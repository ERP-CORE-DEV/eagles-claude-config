# EAGLES Advanced — Implementation Plan

**Project:** EAGLES Advanced AI Platform
**Location:** `C:\RH-OptimERP\eagles-advanced\`
**Date:** 2026-03-02
**Complexity:** XL
**Architecture:** pnpm monorepo with 6 packages

> **CRITICAL**: EAGLES Classic (`C:\Users\hatim\.claude\`) is NEVER modified.
> EAGLES Advanced is a completely separate project.

---

## Executive Summary

EAGLES Advanced adds three new MCP servers to the EAGLES ecosystem:

1. **Token Tracker** — Real-time token/cost tracking with budget alerts and model routing
2. **Vector Memory** — Semantic search over developer memory (replaces flat MEMORY.md)
3. **Drift Detector** — Multi-wave requirement drift detection with 5 scoring metrics

Plus a **Benchmark Framework** to compare Classic vs Advanced head-to-head.

All three MCPs share code through a pnpm monorepo with two internal libraries
(`shared-utils` and `data-layer`). Inter-MCP communication uses a shared SQLite
event bus — no file-based JSON polling, no external services.

---

## Research Findings (10 Agents, ~40 minutes)

### Agent 1: Token Tracking Data Source
- **Key finding**: No tokenizer library needed. Claude Code writes exact USD costs
  to `~/.claude.json` under `lastModelUsage` with per-model breakdown.
- `fs.watch()` on `~/.claude.json` can observe session-end updates.
- Hooks do NOT receive token data in stdin — only tool_name, tool_input, tool_result.
- Pricing: Opus $15/$75 per MTok, Sonnet $3/$15, Haiku $0.80/$4.00.

### Agent 2: Vector Memory Libraries
- **Recommended**: `hnswlib-node` + `@xenova/transformers` with `all-MiniLM-L6-v2`.
- 384 dimensions, ~15ms embed, ~0.5ms query at 10K vectors.
- Rejected: faiss-node (no Windows binaries), chromadb (Python sidecar), vectra (O(n) scan).
- ONNX + MCP gotcha: ONNX logs to stdout, MCP uses stdout — set logLevel='error'.

### Agent 3: Drift Detection Patterns
- Context rot = 3 failure modes: Requirement Amnesia, Scope Creep, Entropy Accumulation.
- Best analogy: Terraform drift detection (declared state vs actual state).
- 5 metrics: Requirements Coverage (0.30), Test Health (0.25), File Churn (0.15),
  Token Efficiency (0.15), Scope Creep (0.15).
- Three-verdict system: SYNCED / WARNING / DRIFTING.
- Existing checkpoint data has 4/5 inputs needed — only Requirements Anchor is missing.

### Agent 4: EAGLES Hooks Analysis
- 18 hooks mapped across 6 events (PreToolUse, PostToolUse, Stop, SessionStart, PreCompact, UserPromptSubmit).
- Hooks and MCPs are isolated — bridge via local HTTP or filesystem.
- PreCompact is highest-value injection point for Advanced features.
- Stop and PreCompact hooks are currently no-ops — prime targets.
- Hook performance budget: <500ms blocking, <800ms advisory.

### Agent 5: Project Structure Design
- pnpm monorepo with 6 packages.
- SQLite event bus for cross-MCP communication (not file-based JSON).
- Build order: shared-utils → data-layer → MCPs → benchmark.
- Vitest workspace for parallel test execution.
- ADR: SQLite WAL mode for concurrent readers.

### Agent 6: Token Tracker MCP Design
- 8 tools: track_usage, get_session_cost, get_agent_costs, get_wave_costs,
  get_budget_status, set_budget, recommend_model, get_cost_report.
- 4-table schema: sessions, tool_calls, agent_usage, wave_usage.
- CLI shim for hooks (bypasses MCP protocol for <50ms latency).
- PostToolUse for data collection, PreToolUse for budget gate.
- Keyword heuristic routing (not tiktoken) — zero dependency.

### Agent 7: Vector Memory MCP Design
- 8 tools: memory_store, memory_search, memory_recall, memory_forget,
  memory_list, memory_export, memory_import, memory_stats.
- WAL pattern for crash-safe persistence (write to .tmp, then rename).
- GDPR Article 17: full index rebuild on delete (not soft delete).
- 90-day confidence decay with 0.1 floor.
- Import pipeline for existing MEMORY.md files.

### Agent 8: Drift Detector MCP Design
- 7 tools: drift_set_requirements, drift_checkpoint, drift_compare,
  drift_report, drift_alert, drift_history, drift_reset.
- SQLite persistence with 4 tables: requirements, checkpoints, drift_scores, alerts.
- Composite score: weighted sum of 5 metrics (0.0–1.0).
- Token efficiency weight redistributed when data unavailable.
- Integration contract: called by @orchestrator between waves.

### Agent 9: Benchmark Framework Design
- 6 phases: Research → Design → Implement → Reproduce → Report → Test.
- Content-addressed task spec (SHA-256 pinned) for reproducibility.
- JSONL event log for raw data collection.
- Report generator produces markdown + Vega-Lite chart specs.
- Token-tracker MCP is a hard prerequisite for cost dimension.
- Runs must be sequential (LiteLLM proxy quota constraint).

### Agent 10: Claude Code Internals
- Hook stdin JSON: {hook_event_name, session_id, tool_name, tool_input, tool_result}.
- Hooks do NOT receive token counts — only tool interaction data.
- MCP servers discovered from: ~/.claude.json > .mcp.json > project settings.
- Token data in ~/.claude.json updated at session end, not real-time.
- SessionStart hook can inject additionalContext into system prompt.
- Stop hook receives transcript_path (JSONL with full conversation).

---

## Architecture

### Monorepo Structure

```
C:\RH-OptimERP\eagles-advanced\
├── packages\
│   ├── shared-utils\          @eagles-advanced/shared-utils
│   ├── data-layer\            @eagles-advanced/data-layer
│   ├── token-tracker-mcp\     @eagles-advanced/token-tracker-mcp
│   ├── vector-memory-mcp\     @eagles-advanced/vector-memory-mcp
│   ├── drift-detector-mcp\    @eagles-advanced/drift-detector-mcp
│   └── benchmark\             @eagles-advanced/benchmark
├── docs\adrs\
├── scripts\
├── .github\workflows\
├── .data\                     (gitignored, runtime persistence)
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── vitest.workspace.ts
```

### Dependency Graph

```
shared-utils (types, constants, validators — zero runtime deps)
     │
     └──► data-layer (EventBus, TokenLedger, VectorStore, DriftStore)
              │
              ├──► token-tracker-mcp (records tokens, budget alerts)
              ├──► vector-memory-mcp (semantic memory, embeddings)
              ├──► drift-detector-mcp (requirement drift scoring)
              │
              └──► benchmark (Classic vs Advanced comparison)
```

### Inter-MCP Communication

```
token-tracker-mcp ──publish("token.recorded")──► EventBus (SQLite WAL)
                                                      │
drift-detector-mcp ──consume("token.recorded")────────┘
```

MCPs communicate through the shared SQLite event bus in `data-layer`.
No compile-time coupling between MCPs — both depend on the `EventBus`
abstraction, not on each other.

### MCP Registration (append to ~/.claude.json)

```json
{
  "token-tracker": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/RH-OptimERP/eagles-advanced/packages/token-tracker-mcp/dist/index.js"],
    "env": { "EAGLES_DATA_ROOT": "C:/RH-OptimERP/eagles-advanced/.data" }
  },
  "vector-memory": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/RH-OptimERP/eagles-advanced/packages/vector-memory-mcp/dist/index.js"],
    "env": { "EAGLES_DATA_ROOT": "C:/RH-OptimERP/eagles-advanced/.data" }
  },
  "drift-detector": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/RH-OptimERP/eagles-advanced/packages/drift-detector-mcp/dist/index.js"],
    "env": { "EAGLES_DATA_ROOT": "C:/RH-OptimERP/eagles-advanced/.data" }
  }
}
```

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Monorepo | pnpm workspaces | Strict hoisting, `workspace:*` protocol, fast on Windows |
| Language | TypeScript 5.5+ (strict) | Existing EAGLES pattern |
| Runtime | Node.js 20+ | LTS, ESM native |
| MCP SDK | @modelcontextprotocol/sdk ^1.25.0 | Match existing MCPs |
| Validation | Zod ^3.23 | Match existing MCPs |
| Database | better-sqlite3 | Synchronous, zero-config, WAL mode, Windows prebuilt |
| Vector Index | hnswlib-node | ~0.5ms query at 10K, HNSW algorithm |
| Embeddings | @xenova/transformers | all-MiniLM-L6-v2, 384 dims, offline, ~15ms |
| Test Runner | Vitest ^2.1 | Native ESM, workspace mode, 4-6x faster than Jest |
| Build | tsup | esbuild wrapper, handles shebang banner |
| CI | GitHub Actions | Existing pattern |

### ADR: SQLite Event Bus Over File-Based JSON

SQLite WAL mode allows one writer + multiple concurrent readers without
blocking. File-based JSON polling (EAGLES Classic pattern) risks partial-read
corruption when multiple MCP processes write concurrently. `better-sqlite3`
is synchronous, which matches the MCP stdio transport's sequential request model.

### ADR: hnswlib-node Over vectra

hnswlib-node provides true HNSW approximate nearest neighbor search at ~0.5ms
for 10K vectors. vectra uses linear scan (O(n)) which degrades at scale.
hnswlib-node has prebuilt Windows binaries via node-gyp. Fallback: if native
build fails, degrade to vectra with a console warning.

---

## Implementation Phases

### Phase 1: Monorepo Foundation (1-2 hours)
- [x] Create directory structure
- [ ] Write root package.json, pnpm-workspace.yaml, tsconfig.base.json
- [ ] Write vitest.workspace.ts, .gitignore, .npmrc
- [ ] Write shared-utils: types (TokenRecord, DriftFinding, VectorEntry),
      constants (ModelPricing, BudgetThresholds), validators
- [ ] Write data-layer: EventBus, TokenLedger, VectorStore, DriftStore, migrations
- [ ] Run `pnpm install` + `pnpm build` — verify zero errors

### Phase 2: Token Tracker MCP (3-4 hours)
- [ ] Implement 8 tools: track_usage, get_session_cost, get_agent_costs,
      get_wave_costs, get_budget_status, set_budget, recommend_model, get_cost_report
- [ ] BudgetService: alert evaluation (ok/warn/critical/halt thresholds)
- [ ] ModelRouter: keyword-based routing (no tiktoken dependency)
- [ ] CLI shim for hook integration (<50ms latency)
- [ ] PostToolUse hook: data collection after every tool call
- [ ] PreToolUse hook: budget gate (exit 2 to block on exceeded budget)
- [ ] Tests: >=80% coverage, 100% on costCalculator and modelRouter

### Phase 3: Vector Memory MCP (4-5 hours)
- [ ] EmbeddingService: lazy model loading, embed(), batchEmbed(), cache
- [ ] VectorStore: hnswlib-node wrapper with upsert, search, delete, rebuild
- [ ] MemoryRepository: WAL-safe JSON persistence
- [ ] 8 tools: memory_store, memory_search, memory_recall, memory_forget,
      memory_list, memory_export, memory_import, memory_stats
- [ ] GDPR: full index rebuild on memory_forget (physical deletion)
- [ ] Import pipeline: parse existing MEMORY.md files
- [ ] AgingService: 90-day confidence decay with 0.1 floor
- [ ] Tests: >=80% coverage, GDPR delete verification

### Phase 4: Drift Detector MCP (3-4 hours)
- [ ] RequirementsParser: extract checklist items from markdown
- [ ] 5 scoring algorithms: requirement_coverage, test_health, file_churn,
      token_efficiency, scope_creep
- [ ] Composite scorer: weighted sum with redistribution for unavailable metrics
- [ ] 7 tools: drift_set_requirements, drift_checkpoint, drift_compare,
      drift_report, drift_alert, drift_history, drift_reset
- [ ] SQLite persistence: 4 tables (requirements, checkpoints, drift_scores, alerts)
- [ ] TokenAwareness: consume token events from EventBus
- [ ] Tests: >=80% overall, 100% on scoring functions

### Phase 5: Benchmark Framework (2-3 hours)
- [ ] BenchmarkOrchestrator: run tasks on Classic and Advanced runners
- [ ] Task definitions: MemoryRetrieval, TokenUsage, DriftDetection
- [ ] Metrics collectors: latency (p50/p95/p99), accuracy (Recall@K), cost
- [ ] Report generators: Markdown + JSON
- [ ] MCP profile switcher: classic.json vs advanced.json
- [ ] Pre-run checklist with SHA-256 task spec verification
- [ ] Tests: orchestrator + symmetry test (identical inputs → zero delta)

### Phase 6: Integration & Registration (1-2 hours)
- [ ] Register all 3 MCPs in ~/.claude.json
- [ ] Wire PostToolUse/PreToolUse hooks in settings.local.json
- [ ] Smoke test: each MCP responds to tool calls
- [ ] Import existing MEMORY.md files into vector store
- [ ] Write ADR documents (4 ADRs)
- [ ] Create setup.sh, register-mcps.sh, smoke-test.sh scripts
- [ ] Final build + test: `pnpm build && pnpm test:coverage`

**Total estimated effort: 14-20 hours across 3-5 sessions**

---

## Scoring Algorithms (Drift Detector)

### Metric 1: Requirements Coverage (weight 0.30)
```
coverage = matched_requirements / total_checklist_items
Match: substring match primary, Levenshtein (<0.3 ratio) fallback
Score: 0.0 (nothing addressed) to 1.0 (all addressed)
```

### Metric 2: Test Health (weight 0.25)
```
pass_rate = tests_passing / tests_total
count_health = min(1.0, tests_total / baseline_test_count)
score = 0.7 * pass_rate + 0.3 * count_health
```

### Metric 3: File Churn (weight 0.15)
```
churn_ratio = unique_files_touched / total_edit_operations
score = churn_ratio  (1.0 = every edit is a different file = good)
```

### Metric 4: Token Efficiency (weight 0.15, nullable)
```
lines_per_1k = (lines_added / tokens_consumed) * 1000
score = min(lines_per_1k / 10.0, 1.0)  (10 LOC/1K tokens = baseline)
When unavailable: weight redistributed proportionally to other 4 metrics
```

### Metric 5: Scope Creep (weight 0.15)
```
unplanned = new_files NOT in planned_files list
creep_ratio = unplanned / total_new_files
score = 1.0 - creep_ratio  (1.0 = no scope creep)
```

### Composite Score
```
drift_score = sum(weight_i * score_i) for all available metrics
Verdicts: SYNCED (>=0.6), WARNING (0.4-0.6), DRIFTING (<0.4)
```

---

## Model Routing Rules (Token Tracker)

| Task Complexity | Budget Status | Recommended Model |
|----------------|---------------|-------------------|
| basic          | ok/warn       | kimi-k2-thinking  |
| basic          | critical/halt | deepseek-v3       |
| standard       | ok            | kimi-k2-thinking  |
| standard       | warn/critical | codestral-2501    |
| advanced       | any           | kimi-k2-thinking  |

Keywords → Complexity mapping:
- **basic**: "rename", "typo", "comment", "format", "lint", "log"
- **standard**: "add", "update", "fix", "test", "component", "endpoint"
- **advanced**: "architect", "refactor", "security", "performance", "migrate"

---

## Pricing Constants (as of 2026-03)

```typescript
export const MODEL_PRICING = {
  "claude-opus-4-6":     { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-sonnet-4-6":   { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-haiku-4-5":    { inputPer1M: 0.80,  outputPer1M: 4.00  },
  "kimi-k2-thinking":    { inputPer1M: 0.60,  outputPer1M: 2.50  },
  "deepseek-r1":         { inputPer1M: 0.55,  outputPer1M: 2.19  },
  "deepseek-v3":         { inputPer1M: 0.27,  outputPer1M: 1.10  },
  "codestral-2501":      { inputPer1M: 0.30,  outputPer1M: 0.90  },
} as const;

export const BUDGET_THRESHOLDS = {
  WARN_USD:     5.00,
  CRITICAL_USD: 20.00,
  HALT_USD:     50.00,
} as const;
```

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|-----------|
| R1 | better-sqlite3 native build fails on Windows | Low | High | node-gyp already works (Visual Studio Build Tools present for .NET 8) |
| R2 | hnswlib-node MSVC compilation fails | Medium | Medium | Fallback to vectra (pure JS, O(n) but functional) |
| R3 | First-run embedding model download (~90MB) | Medium | Low | Cache detection + progress log to stderr |
| R4 | ONNX Runtime stdout logging corrupts MCP stdio | High | High | Set env.backends.onnx.logLevel = 'error' |
| R5 | SQLite file locked by concurrent MCP calls | Low | Medium | WAL mode + better-sqlite3 handles single-writer |
| R6 | Token data only available at session end | High | Medium | Accept one-turn latency; hooks increment counter file as proxy |
| R7 | LLM non-determinism in benchmark runs | High | High | Pin model, temperature=0 via proxy, SHA-256 task spec |
| R8 | drift_compare gamed by orchestrator weights | Low | Low | Weights are compile-time constants, not mutable at runtime |

---

## Rollback Strategy

EAGLES Advanced is 100% additive. Rollback is:

1. Remove 3 entries from `mcpServers` in `~/.claude.json`
2. Remove PostToolUse/PreToolUse hook entries from `settings.local.json`
3. Restart Claude Code

No Classic files modified. No application code touched. MEMORY.md files untouched.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| All 3 MCPs build and register | `pnpm build` zero errors |
| Test coverage | >=80% overall, 100% on scoring/pricing |
| Token Tracker responds to track_usage | JSON response in <100ms |
| Vector Memory embeds and searches | Recall@5 > 0.7 on test queries |
| Drift Detector scores a 3-wave session | Composite score in 0.0-1.0 range |
| Benchmark produces comparison report | Markdown with 18 metric dimensions |
| No modification to EAGLES Classic | Verified by git status in ~/.claude/ |

---

## File Count Estimates

| Package | Source Files | Test Files | Total Lines |
|---------|-------------|------------|-------------|
| shared-utils | 8 | 3 | ~400 |
| data-layer | 7 | 4 | ~600 |
| token-tracker-mcp | 12 | 6 | ~1,200 |
| vector-memory-mcp | 14 | 8 | ~1,740 |
| drift-detector-mcp | 16 | 10 | ~2,090 |
| benchmark | 10 | 3 | ~800 |
| **Total** | **67** | **34** | **~6,830** |

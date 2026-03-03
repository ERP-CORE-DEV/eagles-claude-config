# PROMPT: EAGLES Platform Merge Scan
# Type: Deep Analysis & Comparison Report
# Scope: EAGLES Classic + EAGLES Advanced
# Agents: 20 parallel (8 Classic + 12 Advanced)
# Output: Structured merge-planning comparison report

---

## OBJECTIVE

Perform an EXHAUSTIVE, line-by-line deep scan of BOTH EAGLES platforms to produce a
detailed comparison report enabling a clean merge into a unified EAGLES v2 platform.

## PLATFORMS

| Platform | Location | Tech | Packages |
|----------|----------|------|----------|
| Classic  | `C:\Users\hatim\.claude\eagles-ai-platform\` | Bash + Python + YAML | Flat (scripts + configs) |
| Advanced | `C:\RH-OptimERP\eagles-advanced\` | TypeScript strict + pnpm monorepo | 10 packages, 7 MCPs |

## SCAN METHODOLOGY

### Phase 1: Parallel Deep Scan (20 agents)

Each agent scans a specific non-overlapping scope and produces a structured JSON-compatible
report section. Agents are tagged C1-C8 (Classic) and A1-A12 (Advanced).

#### Classic Platform Agents (C1-C8)

| Agent | Scope | Files |
|-------|-------|-------|
| C1 | AI Routing Core | `start-litellm.py`, `litellm-config.yaml` |
| C2 | Deployment Infra | `docker-compose.yaml`, `infra/docker/*`, `infra/k8s/*` |
| C3 | Orchestration Core | `orchestration/checkpoint-manager.sh`, `orchestration/common.sh` |
| C4 | Orchestration Comms | `orchestration/message-bus.sh`, `orchestration/prerequisite-validator.sh` |
| C5 | Verification & Registry | `orchestration/receipt-*.sh`, `orchestration/skill-*.sh`, `orchestration/self-test.sh` |
| C6 | Orchestration Config | `orchestration/schemas/*`, `orchestration/templates/*`, `orchestration/PROMPT_*.md` |
| C7 | MCP & Setup | `mcp/ai-router/*`, `setup.sh`, `test-gateway.sh` |
| C8 | Launchers & Docs | `LAUNCH_CLAUDE_CODE.bat`, `launch-claude-code.ps1`, `docs/*` |

#### Advanced Platform Agents (A1-A12)

| Agent | Scope | Package |
|-------|-------|---------|
| A1 | Root Configs | `package.json`, `tsconfig.json`, `vitest.workspace.ts`, `pnpm-workspace.yaml` |
| A2 | Shared Utils | `packages/shared-utils/**` |
| A3 | Data Layer Source | `packages/data-layer/src/**` |
| A4 | Data Layer Tests | `packages/data-layer/tests/**` |
| A5 | Token Tracker MCP | `packages/token-tracker-mcp/**` |
| A6 | Vector Memory MCP | `packages/vector-memory-mcp/**` |
| A7 | Drift Detector MCP | `packages/drift-detector-mcp/**` |
| A8 | Provider Router MCP | `packages/provider-router-mcp/**` |
| A9 | Verification MCP | `packages/verification-mcp/**` |
| A10 | Orchestrator MCP | `packages/orchestrator-mcp/**` |
| A11 | Tool Registry | `packages/tool-registry/**` |
| A12 | Benchmark | `packages/benchmark/**` |

### Phase 2: Report Compilation

Compile all 20 agent outputs into a single structured report with these sections:

1. **FILE INVENTORY** — Every file, path, lines, language, purpose
2. **CAPABILITIES MATRIX** — Feature-by-feature: which platform has it, overlap analysis
3. **DATA STRUCTURES** — All schemas, types, interfaces, tables, JSON formats
4. **ALGORITHMS CATALOG** — Every algorithm with exact formulas and weights
5. **CONFIGURATION REGISTRY** — Every env var, constant, default, threshold
6. **INTEGRATION MAP** — External systems, APIs, protocols, auth methods
7. **OVERLAP ANALYSIS** — Features in BOTH platforms (routing, orchestration, verification)
8. **GAP ANALYSIS** — Features in ONE platform only (what each brings uniquely)
9. **CONFLICT ZONES** — Incompatible patterns, naming clashes, tech stack conflicts
10. **MERGE DECISION MATRIX** — For each component: KEEP Classic / KEEP Advanced / MERGE / REWRITE

### Per-Agent Report Template

Each agent MUST produce output following this exact structure:

```
## [AGENT_ID]: [SCOPE_NAME]

### Files Scanned
| File | Lines | Language | Purpose |
|------|-------|----------|---------|

### Exports / Public API
- function/class: name, signature, purpose

### Dependencies
- Internal: (cross-file/cross-package imports)
- External: (npm/pip/system deps)

### Data Structures
- Tables/Schemas/Types with full field definitions

### Algorithms
- Name, formula, parameters, complexity

### Configuration
- Constants, env vars, defaults, thresholds

### Integration Points
- External systems, protocols, auth

### Quality Assessment
- Test coverage, error handling, edge cases, security

### Merge Notes
- KEEP: what must survive the merge
- REPLACE: what Advanced supersedes
- UNIQUE: what only this component provides
- CONFLICTS: potential clashes with the other platform
```

## EXECUTION

```
/gsd-execute --agents 20 --parallel --model haiku
  --scope-c1..c8 EAGLES_CLASSIC
  --scope-a1..a12 EAGLES_ADVANCED
  --output MERGE_SCAN_REPORT.md
  --format structured-comparison
```

## OUTPUT

Final report saved to: `C:\RH-OptimERP\eagles-advanced\MERGE_SCAN_REPORT.md`

# EAGLES Platform Merge Scan Report

**Generated**: 2026-03-03
**Agents**: 20 parallel (C1-C8 Classic, A1-A12 Advanced)
**Scope**: Exhaustive line-by-line scan of both platforms
**Purpose**: Structured comparison for merging into EAGLES v2

---

## 1. FILE INVENTORY

### Classic Platform (`C:\Users\hatim\.claude\eagles-ai-platform\`)

| File | Lines | Language | Purpose |
|------|-------|----------|---------|
| `start-litellm.py` | 124 | Python | LiteLLM proxy launcher + Kimi K2 warm-up |
| `litellm-config.yaml` | 105 | YAML | Model routing (Kimi PRIMARY, 4 endpoints, fallbacks) |
| `setup.sh` | 109 | Bash | Azure AKS + GPU node pool provisioning |
| `deploy-foundry.sh` | 126 | Bash | Azure AI Foundry serverless endpoints (DeepSeek) |
| `test-gateway.sh` | 101 | Bash | LiteLLM health checks (4 progressive tests) |
| `docker-compose.yaml` | 18 | YAML | Local dev LiteLLM (port 4000) |
| `.env` | 38 | Env | API keys (Kimi, Codestral, DeepSeek-R1/V3) |
| `LAUNCH_CLAUDE_CODE.bat` | 3 | Batch | Double-click proxy launch |
| `launch-claude-code.ps1` | 80 | PowerShell | VS Code launch with proxy env |
| `orchestration/common.sh` | 41 | Bash | MSYS path conversion, timestamp helpers |
| `orchestration/checkpoint-manager.sh` | 195 | Bash | Wave checkpoint CRUD + validation |
| `orchestration/prerequisite-validator.sh` | 69 | Bash | Wave gating (exit 2 = BLOCKED) |
| `orchestration/message-bus.sh` | 135 | Bash | Cross-agent finding dedup + aggregation |
| `orchestration/receipt-writer.sh` | 75 | Bash | Agent delivery proof (SHA-256 hash) |
| `orchestration/receipt-verifier.sh` | 72 | Bash | Verify all expected agents completed |
| `orchestration/skill-validator.sh` | 96 | Bash | Skill prereq validation (AND/OR logic) |
| `orchestration/self-test.sh` | 274 | Bash | 31 integration tests (all passing) |
| `orchestration/skill-registry.json` | 220 | JSON | 26 skills with dependency graph |
| `orchestration/schemas/checkpoint-schema.json` | 104 | JSON Schema | Wave checkpoint structure (draft-07) |
| `orchestration/schemas/message-schema.json` | 58 | JSON Schema | Message bus structure |
| `orchestration/schemas/receipt-schema.json` | 76 | JSON Schema | Agent receipt structure |
| `orchestration/templates/WAVE_CHECKPOINT_TEMPLATE.json` | 27 | JSON | Checkpoint defaults |
| `orchestration/PROMPT_EAGLES_ORCHESTRATION_INFRA.md` | 347 | Markdown | Reference documentation |
| `infra/docker/Dockerfile.vllm` | 5 | Dockerfile | vLLM image (v0.15.1) |
| `infra/k8s/ai-inference/litellm-deployment.yaml` | 83 | YAML | 2-replica LiteLLM gateway |
| `infra/k8s/ai-inference/vllm-deployment.yaml` | 77 | YAML | GPU vLLM (Qwen2.5-Coder-32B AWQ) |
| `infra/k8s/ai-inference/litellm-config.yaml` | 77 | YAML | K8s ConfigMap (managed API tier) |
| `infra/k8s/ai-inference/keda-http-scaled-object.yaml` | 27 | YAML | KEDA autoscaling (0-2 replicas) |
| `infra/k8s/ai-inference/gpu-monitoring.yaml` | 67 | YAML | DCGM Prometheus exporter |
| `infra/k8s/ai-inference/model-pvc.yaml` | 14 | YAML | 256Gi model cache |
| `infra/k8s/ai-inference/namespace.yaml` | ~10 | YAML | ai-inference namespace |
| `infra/k8s/ai-inference/vllm-service.yaml` | ~15 | YAML | ClusterIP port 8000 |
| `infra/k8s/ai-inference/image-prepuller.yaml` | ~30 | YAML | Pre-pull vLLM on GPU nodes |
| `mcp/ai-router/src/` | 0 | — | **EMPTY STUB** (never implemented) |

**Classic Totals**: ~34 files, ~2,900 lines, Bash+Python+YAML

### Advanced Platform (`C:\RH-OptimERP\eagles-advanced\`)

| Package | Source Files | Test Files | Source Lines | Test Lines |
|---------|-------------|------------|-------------|------------|
| shared-utils | 5 | 1 | ~130 | ~60 |
| data-layer | 7 | 4 | ~1,060 | ~1,100 |
| token-tracker-mcp | 3 | 1 | ~220 | ~280 |
| vector-memory-mcp | 5 | 1 | ~290 | ~220 |
| drift-detector-mcp | 5 | 2 | ~660 | ~430 |
| provider-router-mcp | 8 | 3 | ~810 | ~420 |
| verification-mcp | 8 | 4 | ~640 | ~590 |
| orchestrator-mcp | 10 | 4 | ~780 | ~740 |
| tool-registry | 4 | 2 | ~175 | ~210 |
| benchmark | 9 | 4 | ~1,450 | ~530 |
| **TOTAL** | **64** | **26** | **~6,215** | **~4,580** |

**Advanced Totals**: 93 TypeScript files, ~13,175 lines, 347 tests across 26 files

---

## 2. CAPABILITIES MATRIX

| Capability | Classic | Advanced | Winner |
|------------|---------|----------|--------|
| **AI Model Routing** | LiteLLM YAML config (static, 4 models) | provider-router-mcp (7 tools, 4 strategies, runtime registration) | Advanced |
| **Cost Tracking** | None | token-tracker-mcp (11 tools, per-call/agent/wave) | Advanced |
| **Budget Enforcement** | None | WARN/CRITICAL/HALT gates + model routing | Advanced |
| **Semantic Memory** | None | vector-memory-mcp (HNSW 384D, hybrid search, TTL) | Advanced |
| **Drift Detection** | None | drift-detector-mcp (8 tools, 5-metric composite) | Advanced |
| **Agent Verification** | None | verification-mcp (8 tools, 5-dim scoring, checkpoints) | Advanced |
| **Agent Orchestration** | Bash scripts (5 components) | orchestrator-mcp (10 tools, DAG, SONA) | Advanced |
| **Tool Registry** | skill-registry.json (26 skills, AND/OR prereqs) | tool-registry (O(1) Map, zod validation) | Tie |
| **Wave Checkpoints** | checkpoint-manager.sh (JSON files) | verification-mcp (SQLite, verified flag) | Tie |
| **Prerequisite Gating** | prerequisite-validator.sh (exit 2 = BLOCK) | Not implemented as standalone | Classic |
| **Message Bus** | message-bus.sh (JSON dedup by file+line+desc) | EventBus (SQLite, waitFor, consumeFiltered) | Advanced |
| **Delivery Receipts** | receipt-writer.sh + receipt-verifier.sh (SHA-256) | Not implemented | Classic |
| **K8s Infrastructure** | 12 manifests (AKS, GPU, KEDA, vLLM, monitoring) | None | Classic |
| **Docker Local Dev** | docker-compose.yaml + start-litellm.py | None | Classic |
| **Azure Setup** | setup.sh + deploy-foundry.sh (GPU, Foundry) | None | Classic |
| **GPU Self-Hosting** | vLLM (Qwen2.5-Coder-32B AWQ, A100 Spot) | None | Classic |
| **GDPR Erasure** | None | memory_forget + HNSW rebuild | Advanced |
| **Benchmarking** | None | benchmark package (12 tasks, 5 dimensions) | Advanced |
| **Failover Classification** | LiteLLM retry (2x) | 5 error categories + strategy selection | Advanced |
| **Self-Testing** | self-test.sh (31 shell tests) | vitest (347 TypeScript tests) | Advanced |

**Score**: Classic 4 | Advanced 14 | Tie 2

---

## 3. DATA STRUCTURES

### Classic Platform (JSON file-based)

**Checkpoint** (`WAVE_{N}_CHECKPOINT.json`):
```
wave (int), prompt (string), status (in_progress|completed|blocked|failed),
started_at, completed_at, session_id, commit_sha,
findings_resolved [{id, file, line, fix_commit}],
findings_remaining [{id, severity P0-P3, file, line, blocker}],
carry_forward [string], files_modified [string],
build_status {passed, command, output_summary},
test_status {passed, total, passed_count, failed_count, coverage_percent},
agent_receipts [string]
```

**Message** (`MESSAGE_BUS_WAVE_{N}.json`):
```
bus_id (string), wave (int), created_at,
messages [{id, from_agent, timestamp, type (finding|status|blocker|info|completion),
  payload {severity P0-P3, file, line, description, fix_suggestion, category}}]
```

**Receipt** (`WAVE_{N}_{AGENT}_{TS}.json`):
```
receipt_id, agent, wave, task, started_at, completed_at,
status (completed|failed|timeout|partial),
findings_count {P0, P1, P2, P3},
files_scanned [string], files_modified [string],
output_hash (sha256:...), evidence [{claim, file, line, verified}]
```

**Skill Registry** (`skill-registry.json`):
```
skills {"/skill-name": {category, description, prerequisites [string],
  prerequisite_mode (all|any), inputs [string], outputs [string], estimated_minutes}}
```

### Advanced Platform (SQLite + TypeScript)

**14 SQLite tables** across 6 databases:

| Database | Table | Key Fields |
|----------|-------|------------|
| token-tracker | `token_records` | id, session_id, model_name, prompt/completion_tokens, estimated_cost_usd, wave_number, agent_name |
| event-bus | `events` | id, topic, published_at, payload (JSON) |
| vector-memory | `memories` | id, text, project, tags (JSON), confidence, source, expires_at, access_count |
| drift-detector | `requirements` | id, session_id, title, checklist_items (JSON), planned_files (JSON) |
| drift-detector | `checkpoints` | id, session_id, wave_number, cumulative_files (JSON), tests_total/passing |
| drift-detector | `drift_scores` | id, session_id, wave_number, drift_score + 5 metric columns |
| drift-detector | `alerts` | id, session_id, wave_number, alert_level, drift_score, message |
| provider-router | `provider_configs` | name (PK), endpoint, api_key_env_var, models (JSON) |
| provider-router | `routing_history` | id, provider, model, strategy, cost_usd, success |
| verification | `agent_scores` | id, session_id, agent_id, 5 dimensions + composite + risk_level |
| verification | `checkpoints` | checkpoint_id, session_id, name, state_json, verified |
| verification | `verification_history` | id, session_id, confidence, suggested_action, flags (JSON) |
| tool-metrics | `tool_metrics` | id, tool_name, duration_ms, success, server_name |

**HNSW Vector Index** (binary file, not SQLite):
- 384 dimensions, cosine similarity, M=16, EF_CONSTRUCTION=200
- Label mapping: uuid <-> numeric label (Map)

**In-Memory Only** (not persisted):
- AgentRegistry (orchestrator-mcp) - Map<agentId, AgentInfo>
- TaskEngine (orchestrator-mcp) - Map<taskId, TaskDefinition>
- SonaStore (orchestrator-mcp) - Map<patternId, LearningPattern>
- ToolRegistry (tool-registry) - Map<name, RegisteredTool>

---

## 4. ALGORITHMS CATALOG

| # | Algorithm | Platform | Formula | Location |
|---|-----------|----------|---------|----------|
| 1 | Token Cost | Advanced | `inputCost + outputCost + cacheRead*0.1 + cacheWrite*1.25` | TokenLedger.calculateCost |
| 2 | Budget Status | Advanced | `halt>=50, critical>=20, warn>=5, ok<5` (USD) | token-tracker server.ts |
| 3 | Model Routing | Advanced | `spend>=CRITICAL+basic->deepseek; spend>=WARN+!adv->codestral; else->kimi` | token-tracker route_by_budget |
| 4 | Cost Advisory | Advanced | 5 heuristics: output>60%, model>50%, agent>50%, volume>500, budget>80% | TokenLedger.generateAdvisory |
| 5 | Requirement Coverage | Advanced | `matchCount / totalItems` (case-insensitive substring) | ScoringAlgorithms.ts |
| 6 | Test Health | Advanced | `0.7*passRate + 0.3*growthRate` | ScoringAlgorithms.ts |
| 7 | File Churn | Advanced | `min(uniqueFiles, totalEdits) / totalEdits` | ScoringAlgorithms.ts |
| 8 | Token Efficiency | Advanced | `min(linesAdded/tokensConsumed * 100, 1.0)` | ScoringAlgorithms.ts |
| 9 | Scope Creep | Advanced | `1 - unplannedFiles/totalNewFiles` | ScoringAlgorithms.ts |
| 10 | Drift Composite | Advanced | Weighted sum (0.30/0.25/0.15/0.15/0.15), null redistribution | CompositeScorer.ts |
| 11 | Exponential Decay | Advanced | `weight = e^(-ageHours / halfLife)` (default 24h) | CompositeScorer.ts |
| 12 | Linear Regression Trend | Advanced | OLS slope; >+0.02=IMPROVING, <-0.02=DEGRADING | CompositeScorer.ts |
| 13 | Agent 5-Dim Scoring | Advanced | Weights: accuracy(0.30), reliability(0.25), consistency(0.20), efficiency(0.15), adaptability(0.10) | agent-scorer.ts |
| 14 | Risk Level | Advanced | `>=0.85 LOW, >=0.70 MEDIUM, >=0.50 HIGH, <0.50 CRITICAL` | agent-scorer.ts |
| 15 | Truth Assessment | Advanced | BASE_CONFIDENCE=0.8, format penalty -0.2, length check | truth-scorer.ts |
| 16 | Cost-Based Routing | Advanced | Sort by `(input/1000*inCost + output/1000*outCost)` ASC | strategies.ts |
| 17 | Round-Robin | Advanced | `candidates[counter % length]` (stateful) | strategies.ts |
| 18 | Latency Routing | Advanced | Min latency from latencyMap (MAX_SAFE_INTEGER for unknown) | strategies.ts |
| 19 | Failover Classification | Advanced | 429->rate_limit, 503->unavailable, ETIMEDOUT->timeout, 500/502/504->server_error | failover.ts |
| 20 | SONA EMA | Advanced | `newRate = 0.3*outcome + 0.7*currentRate` | sona-store.ts |
| 21 | Auto-Archive | Advanced | `rate < 0.2 AND attempts >= 5` -> archived | sona-store.ts |
| 22 | DAG Cycle Detection | Advanced | DFS 3-color (white/gray/black), back edge = cycle | task-engine.ts |
| 23 | Best Agent Selection | Advanced | Filter idle + all capabilities, sort by capabilities.length ASC | coordination.ts |
| 24 | Nearest-Rank Percentile | Advanced | `idx = ceil(N*p) - 1`, clamped to [0, N-1] | MetricsCollector.ts |
| 25 | Cosine Similarity | Advanced | `dot(a,b) / (norm(a)*norm(b))` | VectorStore.ts |
| 26 | SHA-256 Task Hash | Advanced | `createHash("sha256").update(content).digest("hex").slice(0,16)` | TaskRegistry.ts |
| 27 | Running Avg Latency | Advanced | Welford's online mean: `avg += (val - avg) / count` | tool-registry registry.ts |
| 28 | Message Dedup | Classic | Key = `(file, line, description)`, sort P0->P3->info | message-bus.sh |
| 29 | Receipt Hash | Classic | SHA-256 of `{findings, files_modified}` sorted JSON | receipt-writer.sh |
| 30 | Skill Prereq | Classic | `all` mode (AND) or `any` mode (OR) on receipt history | skill-validator.sh |

---

## 5. CONFIGURATION REGISTRY

### Environment Variables

| Variable | Platform | Default | Purpose |
|----------|----------|---------|---------|
| `EAGLES_DATA_ROOT` | Advanced | `${cwd}/.data` | Root for all SQLite + HNSW files |
| `AZURE_AI_API_KEY` | Classic | (none) | Kimi K2 Thinking Azure key |
| `AZURE_AI_API_BASE` | Classic | (none) | `https://ai-services-eagles.openai.azure.com` |
| `CODESTRAL_API_KEY` | Classic | (none) | Codestral Azure AI key |
| `DEEPSEEK_R1_API_KEY` | Classic | (none) | DeepSeek-R1 key |
| `DEEPSEEK_V3_API_KEY` | Classic | (none) | DeepSeek-V3 key |
| `LITELLM_MASTER_KEY` | Classic | `sk-eagles-local-test-1234` | LiteLLM auth token |
| `ANTHROPIC_API_KEY` | Classic | (empty) | Claude fallback |

### Budget Thresholds (Advanced)

| Threshold | USD | Action |
|-----------|-----|--------|
| WARN | $5.00 | Advisory, suggest cheaper models |
| CRITICAL | $20.00 | Route to cheapest model |
| HALT | $50.00 | Stop execution |

### Model Pricing (Advanced, 7 models)

| Model | Input $/1M | Output $/1M |
|-------|-----------|------------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| kimi-k2-thinking | $0.60 | $2.50 |
| deepseek-r1 | $0.55 | $2.19 |
| deepseek-v3 | $0.27 | $1.10 |
| codestral-2501 | $0.30 | $0.90 |

### Drift Scoring Weights (Advanced)

| Metric | Weight |
|--------|--------|
| Requirement Coverage | 0.30 |
| Test Health | 0.25 |
| File Churn | 0.15 |
| Token Efficiency | 0.15 |
| Scope Creep | 0.15 |

### Agent Scoring Weights (Advanced)

| Dimension | Weight |
|-----------|--------|
| Accuracy | 0.30 |
| Reliability | 0.25 |
| Consistency | 0.20 |
| Efficiency | 0.15 |
| Adaptability | 0.10 |

### K8s Resources (Classic)

| Resource | Config |
|----------|--------|
| LiteLLM | 2 replicas, 512Mi-1Gi RAM, 500m-1 CPU |
| vLLM | 1 replica, 32-48Gi RAM, 4-8 CPU, 1 GPU (A100) |
| KEDA | min=0, max=2, 5 req/s, 15min idle |
| PVC | 256Gi managed-csi-premium |
| GPU pool | NC24ads_A100_v4, Spot, auto-scale 0-2 |

---

## 6. INTEGRATION MAP

### Classic External Systems

| System | Protocol | Auth | Files |
|--------|----------|------|-------|
| Azure OpenAI (Kimi K2) | HTTPS REST | API key header | litellm-config.yaml |
| Azure AI Foundry (DeepSeek, Codestral) | HTTPS REST | API key header | litellm-config.yaml |
| Azure AKS | kubectl + az CLI | Azure AD | setup.sh |
| Azure ACR | Docker registry | az acr login | setup.sh |
| NVIDIA Device Plugin | K8s DaemonSet | None | setup.sh |
| KEDA | Helm + K8s CRD | None | setup.sh |
| Prometheus (DCGM) | Scrape port 9400 | None | gpu-monitoring.yaml |

### Advanced External Systems

| System | Protocol | Auth | Files |
|--------|----------|------|-------|
| @xenova/transformers | ONNX local model | None (model download) | EmbeddingService.ts |
| hnswlib-node | C++ native binding | None | VectorStore.ts |
| MCP SDK | stdio transport | None | All 7 servers |
| SQLite (better-sqlite3) | File I/O | None | All stores |

### Inter-MCP Communication (Advanced)

| Topic | Published By | Consumed By |
|-------|-------------|------------|
| `token.recorded` | token-tracker-mcp | None currently |
| `drift.alert` | Not published | Not consumed |
| `memory.stored` | Not published | Not consumed |

**Status**: EventBus infrastructure exists but cross-MCP event subscriptions are not wired.

---

## 7. OVERLAP ANALYSIS

### 7.1 Routing: LiteLLM vs provider-router-mcp

| Dimension | Classic LiteLLM | Advanced provider-router |
|-----------|----------------|------------------------|
| Config | Static YAML | Dynamic (runtime registration via MCP tool) |
| Strategy | simple-shuffle | 4 strategies (cost/round-robin/latency/least-loaded) |
| Cost awareness | No | Yes (per-1k-token pricing) |
| Failover | 2 retries, hardcoded fallback chain | 5 error categories, strategy per category |
| Persistence | None (ephemeral) | SQLite routing history + stats |
| Budget | No | maxCostUsd constraint |
| Providers | 4 Azure endpoints | 3 default (anthropic/openai/google) + runtime add |

**Verdict**: Advanced supersedes Classic for routing intelligence. Classic LiteLLM remains needed as the **actual proxy** (HTTP gateway). Advanced is the **routing brain**.

### 7.2 Orchestration: Bash Scripts vs orchestrator-mcp

| Dimension | Classic Bash | Advanced TypeScript |
|-----------|------------|-------------------|
| Checkpoints | JSON files, file-based CRUD | SQLite, verified flag, agentScore |
| Prerequisites | exit code 2 = BLOCKED | Not standalone (embedded in task engine) |
| Message bus | JSON dedup by (file,line,desc) | EventBus SQLite (waitFor, consumeFiltered) |
| Receipts | SHA-256 hash, evidence chain | Not implemented |
| Skill registry | 26 skills, AND/OR prereqs | tool-registry (O(1), zod, no prereqs) |
| Agent tracking | None | Agent registry + heartbeat + lifecycle |
| Task engine | None | DAG with DFS cycle detection |
| Learning | None | SONA EMA (alpha=0.3, auto-archive) |
| Testing | 31 shell tests | 347 vitest tests |

**Verdict**: Complementary. Classic has battle-tested wave gating + receipts. Advanced has agent intelligence + DAG execution. Both needed.

### 7.3 Checkpoints: checkpoint-manager.sh vs verification-mcp

| Dimension | Classic | Advanced |
|-----------|---------|----------|
| Storage | JSON files in `.claude/checkpoints/` | SQLite `checkpoints` table |
| Schema | 14 fields (build/test status, findings, carry_forward) | 7 fields (stateJson blob, agentScore, verified) |
| Validation | Python-parsed field checking | SQL queries |
| Wave gating | Prerequisite-validator checks P0 count + build + tests | verify_rollback to last-good checkpoint |
| Receipts | Linked via agent_receipts array | Not linked |

**Verdict**: Classic schema is richer (build/test status, findings tracking). Advanced has better persistence (SQLite vs JSON files). Merge should combine Classic's schema richness with Advanced's SQLite backing.

### 7.4 Skill/Tool Registry

| Dimension | Classic skill-registry.json | Advanced tool-registry |
|-----------|---------------------------|----------------------|
| Storage | Static JSON file (26 skills) | In-memory Map (runtime) |
| Lookup | Linear scan | O(1) by name, O(n) by category/tag |
| Prereqs | AND/OR dependency logic | Not implemented |
| Validation | Receipt-based prereq check | zod schema validation |
| Metrics | estimated_minutes per skill | Running avg latency per tool |

**Verdict**: Classic has dependency graph (unique). Advanced has O(1) lookup + metrics. Merge both.

---

## 8. GAP ANALYSIS

### Features ONLY in Classic (must bring to v2)

| Feature | Files | Value |
|---------|-------|-------|
| **K8s Infrastructure** | 12 manifests in infra/k8s/ | Production deployment (AKS, GPU, KEDA) |
| **LiteLLM Proxy** | litellm-config.yaml, start-litellm.py | Actual HTTP gateway (provider-router doesn't proxy) |
| **GPU Self-Hosting** | vllm-deployment.yaml, Dockerfile.vllm | Cost optimization via Spot A100 |
| **Delivery Receipts** | receipt-writer.sh, receipt-verifier.sh | Agent proof-of-work with SHA-256 |
| **Prerequisite Gating** | prerequisite-validator.sh | Exit code 2 = BLOCKED (hook-compatible) |
| **Skill Prerequisites** | skill-registry.json, skill-validator.sh | AND/OR dependency logic for 26 skills |
| **Session Splitting** | Convention (max 2 waves/session) | Context degradation prevention |
| **Azure Foundry** | deploy-foundry.sh | Serverless DeepSeek endpoints |
| **Windows Launchers** | LAUNCH_CLAUDE_CODE.bat, .ps1 | Double-click proxy launch |

### Features ONLY in Advanced (already in v2)

| Feature | Package | Value |
|---------|---------|-------|
| **Semantic Memory** | vector-memory-mcp | HNSW 384D + hybrid search + TTL + GDPR |
| **Token Cost Tracking** | token-tracker-mcp | 11 tools, per-call/agent/wave/model |
| **Budget Enforcement** | token-tracker-mcp | WARN/CRITICAL/HALT gates |
| **Drift Detection** | drift-detector-mcp | 5-metric composite + exponential decay |
| **Agent Verification** | verification-mcp | 5-dim scoring + truth assessment |
| **DAG Task Engine** | orchestrator-mcp | Dependency graph + cycle detection |
| **SONA Learning** | orchestrator-mcp | EMA success rate + auto-archive |
| **Provider Routing Intelligence** | provider-router-mcp | 4 strategies + failover classification |
| **Benchmarking** | benchmark | 12 tasks, Classic vs Advanced comparison |
| **Cost Advisory** | token-tracker-mcp | 5 heuristic rules |
| **Tool Metrics** | data-layer + token-tracker | Percentiles (p50/p95/p99) per tool |

---

## 9. CONFLICT ZONES

### 9.1 Model Routing Philosophy

- **Classic**: Kimi K2 Thinking as PRIMARY ($0.60/$2.50), all Claude aliases routed to Kimi
- **Advanced**: route_by_budget recommends kimi/codestral/deepseek based on spend level
- **K8s variant**: Uses Qwen2.5-Coder via OpenRouter ($0.20/M) — different from both
- **Resolution**: Keep Classic LiteLLM as HTTP proxy. Use Advanced routing brain for model selection. Align model names in route_by_budget with MODEL_PRICING.

### 9.2 Checkpoint Schema Incompatibility

- **Classic**: 14-field JSON with build_status, test_status, findings arrays
- **Advanced**: 7-field SQLite with opaque stateJson blob
- **Resolution**: Migrate Classic schema to SQLite. Add build_status/test_status as first-class columns (not blob).

### 9.3 Message Bus vs EventBus

- **Classic**: File-based JSON, dedup by (file,line,desc), severity sorting
- **Advanced**: SQLite with cursor-based consume, waitFor, consumeFiltered
- **Resolution**: Deprecate Classic file-based bus. Migrate to Advanced EventBus. Port dedup algorithm as a consumeFiltered predicate.

### 9.4 In-Memory vs Persistent State

- **4 Advanced stores are in-memory only**: AgentRegistry, TaskEngine, SonaStore, ToolRegistry
- **Classic is 100% file-persistent**: All JSON on disk
- **Resolution**: Add SQLite backing to the 4 in-memory stores before merge.

### 9.5 Duplicate Tool Metrics

- **data-layer/ToolMetricsStore** (SQLite, percentiles, per-tool)
- **tool-registry/registry** (in-memory, running avg, per-tool)
- **Resolution**: Eliminate ToolRegistry's internal metrics. Use ToolMetricsStore as single source.

### 9.6 Skill Registry vs Tool Registry

- Classic has 26 skills with AND/OR prerequisite logic
- Advanced has O(1) Map with zod validation but no prerequisites
- **Resolution**: Merge prerequisite logic into tool-registry. Import Classic's 26 skills + add all 48 MCP tools.

### 9.7 Version Inconsistencies

- `zod`: ^3.23.0 vs ^3.25.0 across packages
- `better-sqlite3`: ^11.5.0 vs ^11.9.1
- `@modelcontextprotocol/sdk`: ^1.12.0 vs ^1.12.1
- **Resolution**: Align all to latest version. pnpm resolves to single version anyway.

---

## 10. MERGE DECISION MATRIX

| Component | Source | Decision | Rationale |
|-----------|--------|----------|-----------|
| **shared-utils** | Advanced | KEEP | Foundation types, frozen constants, zero risk |
| **data-layer** | Advanced | KEEP | 6 SQLite stores, EventBus, well-tested |
| **token-tracker-mcp** | Advanced | KEEP | 11 tools, highest business value (cost control) |
| **vector-memory-mcp** | Advanced | KEEP | Semantic search, GDPR, TTL — unique to Advanced |
| **drift-detector-mcp** | Advanced | KEEP | 5-metric composite, trend analysis — unique |
| **provider-router-mcp** | Advanced | KEEP | 4 strategies, failover — supersedes LiteLLM routing |
| **verification-mcp** | Advanced | KEEP + EXTEND | Add Classic's checkpoint richness (build/test/findings) |
| **orchestrator-mcp** | Advanced | KEEP + FIX | Add SQLite persistence to 4 in-memory stores |
| **tool-registry** | Advanced | KEEP + EXTEND | Add Classic's prereq logic (AND/OR) + import 26 skills |
| **benchmark** | Advanced | KEEP + EXTEND | Add tasks for provider-router, verification, orchestrator |
| **LiteLLM proxy** | Classic | KEEP | HTTP gateway — Advanced routes, Classic proxies |
| **litellm-config.yaml** | Classic | KEEP (local dev) | Kimi routing for local development |
| **K8s manifests** | Classic | KEEP | Production infra (AKS, GPU, KEDA, monitoring) |
| **Docker Compose** | Classic | KEEP | Local dev convenience |
| **setup.sh** | Classic | KEEP (optional) | GPU provisioning (mark as optional path) |
| **deploy-foundry.sh** | Classic | KEEP (optional) | Serverless endpoints (alternative to GPU) |
| **test-gateway.sh** | Classic | KEEP | Generic LiteLLM health check |
| **checkpoint-manager.sh** | Classic | MIGRATE | Rewrite as orchestrator-mcp tool with rich schema |
| **prerequisite-validator.sh** | Classic | MIGRATE | Integrate into orchestrator-mcp as wave gating tool |
| **message-bus.sh** | Classic | DEPRECATE | Replace with Advanced EventBus |
| **receipt-writer.sh** | Classic | MIGRATE | Register in verification-mcp as receipt tool |
| **receipt-verifier.sh** | Classic | MIGRATE | Register in verification-mcp |
| **skill-validator.sh** | Classic | MIGRATE | Port prereq logic into tool-registry |
| **skill-registry.json** | Classic | MIGRATE | Import 26 skills into tool-registry package |
| **self-test.sh** | Classic | KEEP (CI) | Regression suite for orchestration infra |
| **Schemas (3 JSON)** | Classic | MIGRATE | Convert to TypeScript interfaces in shared-utils |
| **Checkpoint template** | Classic | MIGRATE | Embed in checkpoint-manager tool |
| **Windows launchers** | Classic | KEEP | Developer convenience (bat + ps1) |
| **mcp/ai-router/** | Classic | DELETE | Empty stub — never implemented, LiteLLM supersedes |
| **PROMPT docs** | Classic | KEEP | Reference documentation for orchestration |

### Merge Priority Order

1. **Phase 1** (Zero risk): shared-utils, data-layer
2. **Phase 2** (Core value): token-tracker-mcp, drift-detector-mcp
3. **Phase 3** (Memory): vector-memory-mcp (validate hnswlib native bindings)
4. **Phase 4** (Routing): provider-router-mcp + Classic LiteLLM (brain + proxy)
5. **Phase 5** (Orchestration): orchestrator-mcp + Classic scripts migration
6. **Phase 6** (Verification): verification-mcp + Classic receipts migration
7. **Phase 7** (Registry): tool-registry + Classic skill prereqs
8. **Phase 8** (Infra): K8s manifests, Docker, setup scripts
9. **Phase 9** (Benchmark): Update benchmark with all new server dimensions
10. **Phase 10** (Cleanup): Delete stubs, align versions, final integration tests

---

## Summary

| Metric | Classic | Advanced | Combined (v2) |
|--------|---------|----------|---------------|
| Files | ~34 | 93 | ~120 (after migration) |
| Lines of code | ~2,900 | ~13,175 | ~15,000 |
| Languages | Bash, Python, YAML | TypeScript | TypeScript + Bash (infra only) |
| Tests | 31 shell | 347 vitest | 378+ |
| MCP servers | 0 (stub) | 7 | 7 |
| MCP tools | 0 | 48 | 48+ (receipts, prereqs added) |
| SQLite tables | 0 | 14 | 16+ (checkpoint migration) |
| K8s manifests | 12 | 0 | 12 |
| Skills registered | 26 | 0 | 26 + 48 tools |

**Verdict**: EAGLES Advanced is the core platform (82% of capability). Classic provides infrastructure backbone (K8s, GPU, LiteLLM proxy) and battle-tested orchestration patterns (receipts, prereqs, wave gating) that should be migrated into Advanced's architecture. The merge produces a unified EAGLES v2 with TypeScript intelligence + Bash infrastructure.

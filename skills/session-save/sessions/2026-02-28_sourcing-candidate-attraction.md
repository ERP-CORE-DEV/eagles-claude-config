# Session Save — 2026-02-28 (Updated)
## Microservice: Sourcing & Candidate Attraction

### Git State
- **Branch**: `hatim`
- **Last Commit**: `79b8619` — feat: Dynamic dashboard, full HR profile modal, and candidate CRUD actions
- **Uncommitted Files**: 15 (mostly build artifacts + DELETION_LOG.md)
- **Commits ahead of main**: 166

### Phase Status
- **Phase 5 (EAGLES Max)**: COMPLETED (7 commits, Waves 1-5 + remediation)
- **Phase 3 (Matching Engine)**: PAUSED at Step 7.6.13 (Integration Testing & Performance Validation)
- **Deep Audit**: COMPLETED — 3-agent parallel audit (architecture-explorer, code-reviewer, devsecops)

### What Worked
1. Plan C "EAGLES Max" fully executed across 5 waves + 1 remediation wave
2. Final scores: Security 85, CI/CD 78, Docs 72, Code Quality 90, Hooks 18/18, MCPs 10/10
3. 118 backend tests passing, 141 frontend tests passing
4. 3-agent deep audit completed successfully — 48 total findings across all dimensions
5. DSL prompt for "product-ready" microservice iterated 3 times with progressive auditing

### 3-Agent Deep Audit Results (48 findings)

#### Architecture Agent (12 findings)
| Priority | Finding |
|----------|---------|
| P0 | IMatchRepository DEAD CODE — match results never persisted to CosmosDB |
| P0 | IChangeTrackingService/AuditInterceptor DEAD CODE — CNIL compliance broken |
| P0 | INotificationAdapterService DEAD CODE — incompatible constructor (string param, not IOptions) |
| P0 | DUPLICATE MatchingResult class — Models.Matching (Guid CandidateId) vs Services.Matching (string CandidateId) — structurally incompatible |
| P0 | MatchingSettings bound in DI but completely IGNORED by CandidateMatchingService (hardcoded weights) |
| P1 | DashboardController injects ICandidateRepository directly — CSR violation |
| P1 | ResolutionController injects ICandidateRepository directly — CSR violation |
| P1 | BatchMatchingService Scoped lifetime + per-instance Dictionary = batch status ALWAYS Pending |
| P1 | Duplicate MapToDto across controllers with divergent field mapping |
| P1 | DuplicateValidationService.RequestOverrideAsync is no-op stub + justification length mismatch (controller: 20, service: 50) |
| P1 | GetAuditTrailAsync and GetMatchExplanationsAsync return HARDCODED FAKE data |
| P2 | Triple JobRequirements class duplication across 3 namespaces |

#### Frontend Agent (19 findings)
| Priority | Finding |
|----------|---------|
| P0 | ENABLE_MOCK_AUTH = true HARDCODED in useAuth.ts — every user is "Sophie Bernard, HR" |
| P0 | No login page exists — no /login route at all |
| P0 | Duplicate shadowed useAuth in CandidateManagement-Router.tsx (dead file) |
| P0 | JobManagement.tsx 100% FAKE (setTimeout + hardcoded mock data) |
| P0 | ReportingDashboard.tsx all HARDCODED KPIs (1247 matches, 18.5% conversion — invented) |
| P0 | Dashboard news/todos hardcoded in App.tsx |
| P0 | MatchingDashboard hardcoded jobRequirements shadows the prop |
| P1 | URL construction inconsistency — 3 different patterns across codebase |
| P1 | Bias detection is client-side score variance check (NOT real) |
| P1 | Score breakdown FABRICATED from single aggregate score |
| P1 | Candidate display name shows RAW UUID |
| P1 | Hardcoded user identity in API calls ('frontend-user', 'admin') |
| P1 | useCandidates hook + candidateApi NEVER USED |
| P1 | PII logged to browser console on every candidate submission |
| P1 | Auth state stored as plain JSON in localStorage without expiry |
| P2 | Sidebar username hardcoded "Admin RH" |
| P2 | Notification badge hardcoded 3 |
| P2 | .env.production points to localhost:3000 |
| P2 | CandidateManagement-Router.tsx is dead code |

#### DevSecOps Agent (17 findings)
| Priority | Finding |
|----------|---------|
| P0 | CosmosDB primary key COMMITTED to git history (publish/backend/api/appsettings.json) |
| P0 | Azure DevOps PAT token COMMITTED to git history |
| P0 | Health probe path MISMATCH in k8s manifest (/health vs /health/live, /health/ready) |
| P0 | curl NOT in aspnet:8.0 runtime image — Docker HEALTHCHECK ALWAYS fails |
| P0 | Production pipeline stage NEVER executes (DeployToStaging skipped on main → DeployToProduction also skipped) |
| P0 | Helm CosmosDB secret env var name MISMATCH (CosmosDb__ConnectionString vs ConnectionStrings__CosmosDb) |
| P1 | Dockerfile references DELETED Tests/Unit/*.csproj — docker build FAILS |
| P1 | Frontend .env.production points to localhost:3000 |
| P1 | values.staging.yaml and values.prod.yaml MISSING |
| P1 | Helm pipeline image override keys don't match chart structure |
| P1 | k8s service exposes HTTP port 80 LoadBalancer with NO TLS |
| P1 | No imagePullSecrets for private ACR |
| P1 | Coverage gate is advisory-only (never fails build) |
| P2 | No real SAST tooling (PowerShell regex is not a security scanner) |
| P2 | MapFallbackToFile("index.html") in API backend — shouldn't exist |
| P2 | appsettings.Development.json uses common tenant + RequireHttpsMetadata: false |
| P2 | Pipeline publishes test projects to build artifacts |

### Critical Code Files with Issues
| File | Issues |
|------|--------|
| `src/backend/CandidateMatchingEngine/Program.cs` | Missing DI registrations (IMatchRepository, INotificationAdapterService, IChangeTrackingService), MapFallbackToFile, CosmosDB connection string case mismatch |
| `src/backend/Services/Matching/CandidateMatchingService.cs` | Hardcoded weights (ignores IOptions), magic 0.60 threshold (appsettings says 0.3), SaveMatchingFeedbackAsync/GetMatchExplanationsAsync/GetAuditTrailAsync all FAKE |
| `src/backend/Services/Matching/IBatchMatchingService.cs` | Scoped lifetime + instance Dictionary = always Pending |
| `src/backend/Repositories/Matching/CosmosMatchRepository.cs` | DEAD CODE — never registered, DB name mismatch |
| `src/backend/Services/Integration/NotificationAdapterService.cs` | DEAD CODE — string constructor incompatible with DI |
| `src/backend/appsettings.json` | Empty ConnectionStrings, empty JwtSettings, weight mismatch with code, no SalaryWeight |
| `src/frontend/src/hooks/useAuth.ts` | ENABLE_MOCK_AUTH = true hardcoded |
| `src/frontend/src/pages/jobs/JobManagement.tsx` | 100% fake data |
| `src/frontend/src/pages/reporting/ReportingDashboard.tsx` | 100% hardcoded KPIs |
| `src/frontend/src/services/api/matchingApi.ts` | Fabricated score breakdowns, UUID as display name |
| `src/backend/Dockerfile` | References deleted test projects, curl missing for healthcheck |
| `infra/helm/*/values.yaml` | Env var name mismatch, missing staging/prod values |
| `azure-pipelines-candidate-matching-engine.yml` | Production deploy deadlocked |

### DSL Prompt Status
- **Version**: v3 (corrected with 20 fixes from first audit)
- **Still needs**: Integration of 25+ additional findings from 3-agent deep audit
- **User intent**: Use prompt tonight for team coding session reference
- **User goal**: "Client contract ready" — product ready, not just code quality

### Pending Tasks (Priority Order)
1. **Update DSL prompt** with all 48 findings from 3-agent deep audit
2. **Fix P0 security issues** — Rotate committed CosmosDB key + Azure DevOps PAT
3. **Wire dead code or delete it** — IMatchRepository, INotificationAdapterService, IChangeTrackingService
4. **Fix duplicate MatchingResult classes** — Consolidate to single canonical type
5. **Replace all fake implementations** — SaveMatchingFeedbackAsync, GetMatchExplanationsAsync, GetAuditTrailAsync
6. **Fix BatchMatchingService lifetime** — Singleton or external store for job tracking
7. **Frontend: Remove mock auth** — Implement real auth flow or proper dev toggle
8. **Frontend: Wire real APIs** — JobManagement, ReportingDashboard, MatchingDashboard
9. **Fix Dockerfile** — Remove deleted test project refs, add curl or use wget
10. **Fix deployment pipeline** — Unblock production deploy stage
11. **Fix Helm values** — Env var name alignment, create staging/prod values
12. **Step 7.6.13** — Integration Testing & Performance Validation
13. **PR to main** — hatim branch is 166 commits ahead

### Open PRs
- PR #53: feat: Integrate team-sync MCP into Setup-DeveloperWorkstation (feature/integrate-team-sync-mcp) — OPEN since 2026-01-21

### User Preferences (Observed)
- Wants proof via DSL verification (build + tests + API smoke)
- Expects working app without manual debugging
- Asks for status tables with scores/metrics
- Uses "confidence level" to assess work quality
- Prefers French HR domain context in validations
- Demands "client contract ready" = real data flows, real engines, real deployment
- Uses 3-agent parallel audit as validation technique
- Uses chained DSL skills: /framework → /drift-detect → /gsd-progress → /gsd-verify

### EAGLES Platform Issues (Unresolved)
- LiteLLM/Kimi K2 Thinking: RateLimitError at S0 tier (100K TPM)
- Codestral fallback BROKEN: rejects `thinking_blocks` with HTTP 422
- Complete failure cascade when Kimi rate-limited → both models fail

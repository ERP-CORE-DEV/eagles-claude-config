# Agent Usage Rules (24 agents)

## Core
- @planner: Use for feature planning (phases, risks, estimates)
- @architect: Use for design decisions and ADR generation
- @orchestrator: GSD-style wave execution with fresh sub-agent contexts

## Quality
- @code-reviewer: Run before every PR
- @security-reviewer: Run for changes touching auth, data, or API
- @database-reviewer: Run for any CosmosDB query changes

## Testing
- @tdd-guide: Use when starting new features
- @e2e-runner: Use for user flow testing
- @verifier: Post-execution validation against requirements

## DevOps
- @build-error-resolver: Use when builds break
- @devsecops: Security scanning pipeline (SAST, DAST, deps, containers)
- @codegen: Template-driven code generation (CRUD, components, services)

## Documentation (Tech Writers Team)
- @doc-orchestrator: Editor-in-Chief -- dispatches /update-docs to team
- @doc-hub-architect: Information Architect -- builds INDEX hub
- @doc-official-writer: Senior Technical Writer -- Diataxis/Arc42/Stripe docs
- @doc-code-analyst: Code Documentarian -- deep technical docs (Rust Book style)
- @doc-diagram-artist: Visual Designer -- Eraser.io diagrams (C4/Arc42)

## Language
- @go-reviewer: Go idiomatic review with concurrency checks
- @python-reviewer: PEP 8 compliance and type hint validation
- @go-build-resolver: Go module dependency error resolution

## Maintenance
- @refactor-cleaner: Run monthly for dead code cleanup
- @researcher: Deep multi-source research (GitHub, docs, web)
- @framework-advisor: Recommends optimal framework configuration
- @architecture-explorer: Deep codebase analysis for architecture patterns

## Guidelines
- Max 3-4 agents active per session (context window)
- Prefer haiku agents for simple tasks (save tokens)
- Use orchestrator for multi-phase tasks to prevent context rot
- Use /update-docs to invoke the tech writers team (dispatches 4 agents in parallel)

# Agent Usage Rules

- @planner: Use for feature planning (phases, risks, estimates)
- @architect: Use for design decisions and ADR generation
- @code-reviewer: Run before every PR
- @security-reviewer: Run for changes touching auth, data, or API
- @tdd-guide: Use when starting new features
- @build-error-resolver: Use when builds break
- @e2e-runner: Use for user flow testing
- @refactor-cleaner: Run monthly for dead code cleanup
- @doc-updater: Run after significant code changes
- @database-reviewer: Run for any CosmosDB query changes
- Max 3-4 agents active per session (context window)
- Prefer haiku agents for simple tasks (save tokens)

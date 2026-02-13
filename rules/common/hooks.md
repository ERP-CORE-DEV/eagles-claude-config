# Hook Rules

- All hooks defined in hooks/hooks.json
- PreToolUse hooks can block execution (exit code 2)
- PostToolUse hooks for warnings only (non-blocking)
- Keep hooks fast (< 1 second execution)
- Use async patterns for heavy hook operations
- Document every hook with: trigger, purpose, exit codes
- Test hooks before deploying to team
- Strategic compaction: suggest /compact every 50 tool calls
- Never modify files in hooks (read-only analysis)
- Log hook activity for debugging

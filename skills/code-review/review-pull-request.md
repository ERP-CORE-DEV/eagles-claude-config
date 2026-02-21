---
name: review-pull-request
description: Review pull requests for code quality, security, and best practices
argument-hint: [focus: security|performance|architecture|all]
tags: [code-review, PR, pull-request, quality, best-practices]
---

# Pull Request Review Guide

---

## Review Checklist

### 1. Correctness
- [ ] Does the code do what the PR description claims?
- [ ] Are edge cases handled (null, empty, boundary values)?
- [ ] Are error paths handled gracefully?
- [ ] Do async operations handle failures and timeouts?

### 2. Security
- [ ] No secrets, API keys, or credentials in code
- [ ] Input validation at system boundaries
- [ ] No SQL/NoSQL injection vectors
- [ ] No XSS vulnerabilities (user input rendered unsanitized)
- [ ] Authentication/authorization checks in place
- [ ] No PII in logs

### 3. Performance
- [ ] No N+1 query patterns
- [ ] Database queries use appropriate indexes
- [ ] No unbounded result sets (pagination)
- [ ] Heavy computations offloaded to background jobs
- [ ] Appropriate caching for repeated reads

### 4. Code Quality
- [ ] Methods are focused (single responsibility)
- [ ] No unnecessary code duplication
- [ ] Variable/function names are descriptive
- [ ] No dead code or commented-out code
- [ ] Error messages are helpful (not generic)

### 5. Testing
- [ ] New code has tests
- [ ] Tests cover happy path AND error cases
- [ ] Tests are deterministic (no flaky behavior)
- [ ] Mocks are used appropriately

### 6. Architecture
- [ ] Changes follow existing patterns in the codebase
- [ ] No circular dependencies introduced
- [ ] API contracts are backward-compatible
- [ ] Database migrations are reversible

---

## Review Comments Style

```markdown
# Blocking issue (must fix)
🔴 **Bug**: This will throw NullReferenceException when `candidate.Skills` is null.
Suggestion: `candidate.Skills?.Count ?? 0`

# Non-blocking suggestion
🟡 **Suggestion**: Consider extracting this into a helper method for readability.

# Praise
🟢 **Nice**: Clean use of the strategy pattern here!

# Question
❓ **Question**: Is there a reason we're not using the existing `PagedResult<T>` here?

# Nitpick (optional)
💭 **Nit**: Minor formatting - extra blank line on L42.
```

---

## Common PR Anti-Patterns

| Anti-Pattern | Better Approach |
|-------------|----------------|
| 2000+ line PR | Break into smaller PRs |
| Mixing refactor + feature | Separate PRs |
| No description | Require PR template |
| No tests | Request tests before approval |
| Force-push during review | Push new commits |

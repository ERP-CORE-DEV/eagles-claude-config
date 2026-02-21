---
name: rename-variable
description: Safely rename variables, methods, and classes across the codebase
argument-hint: [scope: local|file|project] [tool: ide|regex|ast]
tags: [refactoring, naming, clean-code, readability, maintainability]
---

# Rename Variable / Method / Class Guide

Good names are the cheapest form of documentation. A rename is the safest refactoring — but must be done systematically.

---

## Naming Conventions by Language

| Language | Variables | Methods | Classes | Constants |
|----------|-----------|---------|---------|-----------|
| C# | `camelCase` | `PascalCase` | `PascalCase` | `PascalCase` |
| TypeScript | `camelCase` | `camelCase` | `PascalCase` | `UPPER_SNAKE` |
| Python | `snake_case` | `snake_case` | `PascalCase` | `UPPER_SNAKE` |
| Java | `camelCase` | `camelCase` | `PascalCase` | `UPPER_SNAKE` |
| Go | `camelCase` (private) / `PascalCase` (exported) | same | same | same |

---

## Semantic Naming Rules

```
✗ data, info, temp, result, item, val, x
✓ candidateScore, matchingResult, jobRequirements

✗ process(), handle(), doStuff(), manage()
✓ calculateMatchScore(), validateCandidateProfile(), sendNotification()

✗ IManager, AbstractHelper, BaseProcessor
✓ ICandidateRepository, MatchingService, ScoreCalculator
```

### Boolean Naming

```typescript
// ✗ Bad
let flag = true;
let status = false;

// ✓ Good
let isActive = true;
let hasPermission = false;
let canEdit = true;
let shouldRetry = false;
```

---

## IDE Refactoring Tools

### Visual Studio / Rider (.NET)
```
Ctrl+R, Ctrl+R  →  Rename symbol (updates all references)
F2               →  Quick rename
```

### VS Code (TypeScript/JS)
```
F2               →  Rename symbol
Ctrl+Shift+H    →  Find and replace across files
```

### PyCharm (Python)
```
Shift+F6         →  Rename (updates imports, docstrings)
```

---

## Safe Rename Process

1. **Verify tests pass** before starting
2. **Use IDE rename** (not find-replace) for type-aware renaming
3. **Check for string references** (API routes, config keys, serialization)
4. **Run tests** after rename
5. **Check serialization** — renaming a DTO property may break API contracts

### Serialization-Safe Rename (.NET)

```csharp
// Rename property internally but keep JSON name stable
public class CandidateDto
{
    [JsonPropertyName("min_score")]  // Keeps API contract stable
    public decimal MinimumMatchScore { get; set; }
}
```

### Serialization-Safe Rename (TypeScript)

```typescript
interface ApiResponse {
  min_score: number;  // API contract — don't rename
}

interface InternalModel {
  minimumMatchScore: number;  // Internal — safe to rename
}

function mapResponse(api: ApiResponse): InternalModel {
  return { minimumMatchScore: api.min_score };
}
```

---

## Regex-Based Rename (Last Resort)

```bash
# Preview changes first
grep -rn "oldName" src/

# Targeted replace (with word boundaries)
find src -name "*.ts" -exec sed -i 's/\boldName\b/newName/g' {} +

# Verify no partial matches
grep -rn "newName" src/ | head -20
```

---

## When NOT to Rename

| Scenario | Reason |
|----------|--------|
| Public API property | Breaking change for consumers |
| Database column | Requires migration + backward compatibility |
| Environment variable | Deployed configs reference old name |
| Serialized field | Stored data uses old name |

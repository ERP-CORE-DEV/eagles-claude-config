---
name: setup-test-coverage
description: Configure code coverage reporting for tests
argument-hint: [stack: dotnet|node|python]
tags: [testing, coverage, quality, CI, metrics]
---

# Test Coverage Configuration Guide

---

## .NET (Coverlet)

```bash
dotnet add package coverlet.collector
dotnet test --collect:"XPlat Code Coverage" --results-directory ./coverage

# Generate HTML report
dotnet tool install -g dotnet-reportgenerator-globaltool
reportgenerator -reports:coverage/**/coverage.cobertura.xml -targetdir:coverage/html -reporttypes:Html
```

### Coverage in CI (Azure DevOps)

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: test
    arguments: '--collect:"XPlat Code Coverage" --configuration Release'
- task: PublishCodeCoverageResults@2
  inputs:
    codeCoverageTool: Cobertura
    summaryFileLocation: '$(Agent.TempDirectory)/**/coverage.cobertura.xml'
```

---

## JavaScript (Jest / Vitest)

```json
// package.json
{
  "scripts": {
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "collectCoverageFrom": ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/**/index.ts"],
    "coverageThreshold": {
      "global": { "branches": 80, "functions": 80, "lines": 80, "statements": 80 }
    }
  }
}
```

### Vitest

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/*.stories.*'],
      thresholds: { branches: 80, functions: 80, lines: 80 },
    },
  },
});
```

---

## Python (pytest-cov)

```bash
pip install pytest-cov
pytest --cov=src --cov-report=html --cov-report=term --cov-fail-under=80
```

```ini
# pyproject.toml
[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*", "*/__pycache__/*"]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

---

## Coverage Targets

| Level | Target | Notes |
|-------|--------|-------|
| Critical paths | 90%+ | Auth, payments, matching |
| Business logic | 80%+ | Services, domain models |
| UI components | 60-70% | Visual; use snapshot tests |
| Generated code | Skip | Don't inflate metrics |

## CI Integration

```yaml
# GitHub Actions
- name: Test with coverage
  run: npm run test:coverage
- name: Upload to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: coverage/lcov.info
    fail_ci_if_error: true
```

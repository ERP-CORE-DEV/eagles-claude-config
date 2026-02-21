---
name: setup-git-hooks
description: Setup Git hooks for linting, formatting, tests, and commit message validation
argument-hint: [tool: husky|pre-commit|dotnet-format|lefthook]
tags: [git, hooks, husky, pre-commit, linting, conventional-commits]
---

# Git Hooks Setup Guide

Git hooks enforce quality gates before commits and pushes reach the repository.

---

## 1. Husky (Node.js Projects)

### Installation

```bash
npm install -D husky lint-staged
npx husky init
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npx lint-staged
```

### Commit-msg Hook (Conventional Commits)

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci']],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
```

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

### lint-staged Configuration

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,scss}": ["prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## 2. Pre-commit (Python Projects)

### Installation

```bash
pip install pre-commit
```

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=500']
      - id: detect-private-key

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
```

```bash
pre-commit install
pre-commit run --all-files  # First-time check
```

---

## 3. .NET Projects

### dotnet-format Hook

```bash
# .husky/pre-commit (if using Node.js tooling)
dotnet format --verify-no-changes --verbosity quiet
if [ $? -ne 0 ]; then
  echo "Run 'dotnet format' to fix formatting issues"
  exit 1
fi
```

### Secret Scanning

```bash
# .husky/pre-commit
npx secretlint "**/*"
```

```json
// .secretlintrc.json
{
  "rules": [
    { "id": "@secretlint/secretlint-rule-preset-recommend" },
    { "id": "@secretlint/secretlint-rule-pattern",
      "options": { "patterns": [
        { "name": "Azure Connection String", "pattern": "AccountKey=[A-Za-z0-9+/=]{44,}" }
      ]}
    }
  ]
}
```

---

## 4. Lefthook (Multi-language)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint-ts:
      glob: "*.{ts,tsx}"
      run: npx eslint --fix {staged_files}
    format-cs:
      glob: "*.cs"
      run: dotnet format --include {staged_files}
    test:
      run: npm run test:changed

commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}

pre-push:
  commands:
    build:
      run: npm run build
    test-full:
      run: npm run test
```

---

## Hook Summary

| Hook | When | Use For |
|------|------|---------|
| `pre-commit` | Before commit created | Lint, format, secret scan |
| `commit-msg` | After message written | Conventional commit validation |
| `pre-push` | Before push to remote | Full test suite, build check |
| `post-merge` | After merge/pull | Install deps (`npm install`) |

## Skipping Hooks

```bash
git commit --no-verify -m "WIP: temporary"  # Skip pre-commit + commit-msg
git push --no-verify                          # Skip pre-push
```

Only skip for emergencies — never as habit.

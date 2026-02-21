---
name: create-feature-branch
description: Create and manage feature branches following Git Flow or GitHub Flow
argument-hint: [workflow: gitflow|githubflow|trunk]
---

# Git Feature Branch Workflow

## Create Feature Branch
```bash
# From develop (Git Flow)
git checkout develop
git pull origin develop
git checkout -b feature/user-authentication

# From main (GitHub Flow)
git checkout main
git pull origin main
git checkout -b feature/user-authentication
```

## Make Changes
```bash
git add .
git commit -m "feat: Add JWT authentication"
git push -u origin feature/user-authentication
```

## Create Pull Request
```bash
gh pr create --title "feat: Add JWT authentication" \
  --body "Implements user authentication with JWT tokens. Closes #123" \
  --base develop
```

## Sync with Base Branch
```bash
# Rebase approach (cleaner history)
git checkout feature/user-authentication
git fetch origin
git rebase origin/develop

# Merge approach (preserves history)
git merge origin/develop
```

## Complete Feature
```bash
# After PR approval
git checkout develop
git pull origin develop
git merge --no-ff feature/user-authentication
git push origin develop
git branch -d feature/user-authentication
git push origin --delete feature/user-authentication
```

## Conventional Commits
```
feat: Add new feature
fix: Bug fix
docs: Documentation
style: Formatting
refactor: Code restructuring
test: Adding tests
chore: Maintenance
```


## French HR Context

Branch naming for RH-OptimERP microservices:

**Convention:**
```
<type>/<microservice>-<short-description>

Examples:
  feature/sourcing-candidate-matching-engine
  fix/payroll-smic-calculation-2025
  chore/training-cpf-integration
  hotfix/dsn-declaration-january
```

### Automated Branch Creation

```bash
#!/bin/bash
# create-feature-branch.sh
# Usage: ./create-feature-branch.sh feature candidate-matching-engine

TYPE=$1
DESCRIPTION=$2
BRANCH_NAME="${TYPE}/${DESCRIPTION}"

# Validate branch type
case "$TYPE" in
  feature|fix|chore|hotfix|release)
    ;;
  *)
    echo "Type invalide. Utilisez: feature, fix, chore, hotfix, release"
    exit 1
    ;;
esac

# Create and switch to branch
git checkout main
git pull origin main
git checkout -b "$BRANCH_NAME"

echo "Branche creee: $BRANCH_NAME"
echo "Base: main (derniere version)"
```

### .NET Pre-commit Hook

```csharp
// .husky/pre-commit (or git hook)
// Validate branch name follows convention
var branchName = GetCurrentBranch();
var validPattern = @"^(feature|fix|chore|hotfix|release)/[a-z0-9-]+$";

if (!Regex.IsMatch(branchName, validPattern))
{
    Console.Error.WriteLine($"Nom de branche invalide: {branchName}");
    Console.Error.WriteLine("Format attendu: <type>/<description>");
    Environment.Exit(1);
}
```

### Node.js Branch Validation

```typescript
// scripts/validate-branch.ts
import { execSync } from 'child_process';

const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
const validPattern = /^(feature|fix|chore|hotfix|release)\/[a-z0-9-]+$/;

if (!validPattern.test(branch)) {
  console.error(`Nom de branche invalide: ${branch}`);
  console.error('Format attendu: <type>/<description>');
  process.exit(1);
}

console.log(`Branche valide: ${branch}`);
```

## Azure DevOps Integration

```yaml
# azure-pipelines.yml - Branch policies
trigger:
  branches:
    include:
      - main
      - feature/*
      - fix/*
      - hotfix/*

pr:
  branches:
    include:
      - main
  autoCancel: true

# Branch protection: Require PR reviews
# Minimum 1 reviewer for feature branches
# Minimum 2 reviewers for hotfix branches
```

## Testing

```bash
# Test branch naming validation
./create-feature-branch.sh feature candidate-matching
# Expected: Branch created successfully

./create-feature-branch.sh invalid bad-name
# Expected: "Type invalide" error
```

## Related Skills

- `/configure-branch-protection` - Set up branch protection rules
- `/setup-git-hooks` - Automated pre-commit validation


## Note: Contexte RH Francais

Pour les projets RH francais comme RH-OptimERP, les branches de fonctionnalite suivent la convention : `feature/<microservice>-<description>`. Les branches touchant des donnees sensibles (paie, NIR, securite sociale) doivent faire l'objet d'une revue obligatoire par le DPO ou le responsable securite avant fusion, conformement aux exigences CNIL.

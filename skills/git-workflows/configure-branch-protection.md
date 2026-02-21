---
name: configure-branch-protection
description: Configure branch protection rules for main/develop branches
argument-hint: [platform: github|gitlab|azure-devops]
tags: [git, branch-protection, CI, code-review, governance]
---

# Branch Protection Configuration Guide

Protect critical branches from direct pushes, force-pushes, and unreviewed changes.

---

## GitHub

### Via UI
Settings → Branches → Add rule for `main`

### Via GitHub CLI

```bash
gh api repos/{owner}/{repo}/rulesets -X POST -f name="main-protection" \
  -f target="branch" \
  -f enforcement="active" \
  --input - << 'EOF'
{
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "rules": [
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": true
    }},
    { "type": "required_status_checks", "parameters": {
        "required_status_checks": [
          { "context": "build" },
          { "context": "test" }
        ],
        "strict_required_status_checks_policy": true
    }},
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
EOF
```

### CODEOWNERS

```
# .github/CODEOWNERS
* @team-lead
src/backend/ @backend-team
src/frontend/ @frontend-team
*.yml @devops-team
```

---

## Azure DevOps

### Via REST API

```bash
az repos policy create --branch main --repository-id {repo-id} \
  --blocking true --enabled true \
  --policy-type "Minimum number of reviewers" \
  --settings '{"minimumApproverCount": 1, "creatorVoteCounts": false}'

az repos policy create --branch main --repository-id {repo-id} \
  --blocking true --enabled true \
  --policy-type "Build" \
  --settings '{"buildDefinitionId": 42, "queueOnSourceUpdateOnly": true}'
```

### Branch Policy Matrix

| Policy | main | develop | feature/* |
|--------|------|---------|-----------|
| Min reviewers | 2 | 1 | 0 |
| Build validation | Required | Required | Optional |
| Comment resolution | Required | Required | None |
| Linked work items | Required | Optional | None |
| Merge strategy | Squash | Squash | Any |

---

## GitLab

```yaml
# Settings → Repository → Protected branches → main
# Or via API:
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/protected_branches" \
  -d "name=main&push_access_level=0&merge_access_level=30&allow_force_push=false"
```

---

## Recommended Rules

| Rule | Purpose |
|------|---------|
| Require PR reviews (1-2) | Catch bugs before merge |
| Require status checks | Prevent broken builds on main |
| Dismiss stale reviews on new push | Re-review after changes |
| No force push | Preserve history |
| No deletion | Prevent accidental branch removal |
| Require linear history | Clean git log |
| Require signed commits | (Optional) Verify author identity |

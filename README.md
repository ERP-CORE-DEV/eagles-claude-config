# EAGLES - Claude Code Configuration

Configuration partagee pour l'equipe EAGLES du projet **RH-OptimERP** (12 microservices).

## Contenu

| Composant | Nombre | Description |
|-----------|--------|-------------|
| Agents | 15 | architect, code-reviewer, tdd-guide, build-error-resolver, etc. |
| Skills | 35 | /tdd, /plan, /scaffold, /e2e, /build-fix, /code-review, etc. |
| Rules | 10 | coding-style, git-workflow, testing, security, patterns, etc. |
| Hooks | 5 | doc-blocker, tsc-check, session-start, pre-compact, stop |
| MCP Servers | 6 | chrome-devtools, github, filesystem, prompt-library, team-sync, qco |
| Permissions | 165 allow + 6 deny | Pre-configured for .NET 8, React, Azure, Docker, Helm |

## Equipe

| Developpeur | Role |
|-------------|------|
| HATIM | Lead - Sourcing & Candidate Attraction |
| MOHAMMED-REDA | Developer |
| HOUSSINE | Developer |
| HOUDAIFA | Developer |
| LAHCEN | Developer |

## Pre-requis

- **Windows 11** avec PowerShell 5.1+
- **Node.js 20+** et npm ([nodejs.org](https://nodejs.org/))
- **Git** configure avec acces GitHub ([git-scm.com](https://git-scm.com/))
- **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`)
- **MCPs** clones dans `C:\RH-OptimERP\MCPs\`

## Installation rapide

```powershell
git clone https://github.com/ERP-CORE-DEV/eagles-claude-config.git
cd eagles-claude-config
.\setup_claude.ps1
```

Le script va:
1. Verifier les pre-requis (Node.js, Git, npx)
2. Demander votre nom (equipe EAGLES)
3. Sauvegarder votre config existante (si presente)
4. Installer agents, skills, rules dans `~/.claude/`
5. Configurer settings.json, .mcp.json, hooks
6. Verifier les serveurs MCP

## Apres l'installation

```powershell
# 1. Authentification Claude AI
claude auth login

# 2. Configurer le token GitHub
setx GITHUB_PERSONAL_ACCESS_TOKEN "ghp_votre_token"

# 3. Cloner votre microservice
git clone https://github.com/ERP-CORE-DEV/rh-optimerp-votre-service.git

# 4. Ouvrir dans VS Code avec l'extension Claude Code

# 5. Verifier que les 6 serveurs MCP se connectent
```

## Mise a jour

Quand la config est mise a jour par le lead:

```powershell
cd eagles-claude-config
git pull
.\setup_claude.ps1 -Update
```

Le flag `-Update` saute le backup et ecrase uniquement agents/skills/rules/settings.

## Stack technique

- **Backend**: .NET 8 (ASP.NET Core Web API), CosmosDB SDK 3.54
- **Frontend**: React 18 (TypeScript), Ant Design 5.14, Redux Toolkit
- **Infrastructure**: Azure AKS, ACR, Key Vault, Helm
- **CI/CD**: Azure Pipelines (ELYSTEK org)
- **Pattern**: Controller-Service-Repository (pas CQRS/MediatR)
- **Domaine**: RH francais (SMIC, CPF, OPCO, RNCP, CNIL, GDPR)

## Serveurs MCP

| Serveur | Type | Description |
|---------|------|-------------|
| chrome-devtools | npx | Debug navigateur via DevTools Protocol |
| github | npx | Operations GitHub (PRs, issues, code search) |
| filesystem | npx | Acces fichiers systeme |
| prompt-library | local | Orchestrateur de prompts MCP |
| team-sync | local | Synchronisation equipe (PRs, conflits, issues) |
| qco | local | Quality Code Orchestrator (generation 4 couches) |

## Structure du repo

```
eagles-claude-config/
  setup_claude.ps1       # Script d'installation PowerShell
  README.md              # Ce fichier
  agents/                # 15 agents specialises
  skills/                # 35 slash commands
  rules/
    common/              # 8 regles communes
    dotnet/              # 2 regles .NET
  config/
    settings.json        # Permissions, hooks, model
    settings.local.json  # Activation MCP
    mcp.json             # 6 serveurs MCP
```

# EAGLES Pro v2.1.0 - Claude Code Configuration

Configuration partagee pour l'equipe EAGLES du projet **RH-OptimERP** (12 microservices).

## Contenu

| Composant | Nombre | Description |
|-----------|--------|-------------|
| Agents | 25 | architect, code-reviewer, tdd-guide, doc-orchestrator, 5 doc agents, etc. |
| Skills | 103 | /tdd, /plan, /scaffold, /e2e, /gsd-plan, /update-docs, /gitleaks, etc. |
| Rules | 10 | coding-style, git-workflow, testing, security, patterns, etc. |
| Hooks | 9 | doc-blocker, gitleaks-gate, coverage-gate, tsc-check, context-rot, etc. |
| MCP Servers | 10 | chrome-devtools, github, filesystem, gitmcp, context7, team-sync, etc. |
| Permissions | 177 allow + 6 deny | Pre-configured for .NET 8, React, Azure, Docker, Helm |
| Docs | 17 | Modern HTML doc site (Tailwind, glassmorphism, dark mode) |

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

# 2. Cloner votre microservice
git clone https://github.com/ERP-CORE-DEV/rh-optimerp-votre-service.git

# 3. Ouvrir dans VS Code avec l'extension Claude Code

# 4. Verifier que les 10 serveurs MCP se connectent
```

> **Note**: Le token GitHub (`GITHUB_PERSONAL_ACCESS_TOKEN`) est deja configure dans le `.mcp.json` via variable d'environnement. Assurez-vous qu'il est defini dans votre systeme.

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
| gitmcp | npx | Documentation GitHub repos (fetch docs, search code) |
| context7 | npx | Documentation a jour pour librairies (resolve + query) |
| memory | npx | Memoire persistante entre sessions |
| sequential-thinking | npx | Raisonnement sequentiel structure |
| prompt-library | local | Orchestrateur de prompts MCP |
| team-sync | local | Synchronisation equipe (PRs, conflits, issues) |
| qco | local | Quality Code Orchestrator (generation 4 couches) |

## Structure du repo

```
eagles-claude-config/
  setup_claude.ps1       # Script d'installation PowerShell
  README.md              # Ce fichier
  INSTRUCTIONS.md        # Guide d'installation detaille
  agents/                # 25 agents specialises
  skills/                # 103 slash commands
  rules/
    common/              # 8 regles communes
    dotnet/              # 2 regles .NET
  config/
    settings.json        # Permissions, hooks (9), model
    settings.local.json  # Template local (model override)
    mcp.json             # 10 serveurs MCP
  hooks/
    doc-blocker.py       # Bloque les .md hors paths autorises
    hooks.json           # Configuration des 9 hooks
  docs/                  # 17 fichiers HTML (site doc moderne)
    index.html           # Hub principal
    project/             # 7 pages documentation projet
    code/                # 2 pages documentation code
    assets/              # CSS + JS partages
    diagrams/            # 4 diagrammes Eraser.io
```

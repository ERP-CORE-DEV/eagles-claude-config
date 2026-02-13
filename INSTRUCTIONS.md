# Instructions pour l'equipe EAGLES - Configuration Claude Code

Bonjour l'equipe,

Voici les etapes pour configurer **Claude Code** avec le framework EAGLES (15 agents, 35 skills, 10 rules, 5 hooks, 6 MCP servers).

## Pre-requis

- **Windows 11** avec PowerShell 5.1+
- **Node.js 20+** et npm ([nodejs.org](https://nodejs.org/))
- **Git** configure avec acces GitHub ([git-scm.com](https://git-scm.com/))
- **VS Code** avec l'extension **Claude Code**
- **`GITHUB_PERSONAL_ACCESS_TOKEN`** defini dans vos variables d'environnement systeme

## Etape 1 — Installer Claude Code CLI

```powershell
npm install -g @anthropic-ai/claude-code
```

## Etape 2 — Cloner et lancer le script de configuration

```powershell
git clone https://github.com/ERP-CORE-DEV/eagles-claude-config.git
cd eagles-claude-config
.\setup_claude.ps1
```

Le script va:
1. Verifier vos pre-requis (Node.js, Git, npx)
2. Vous demander votre nom (MOHAMMED-REDA, HOUSSINE, HOUDAIFA, LAHCEN)
3. Sauvegarder votre config existante (si presente)
4. Installer 15 agents, 35 skills, 10 rules dans `~/.claude/`
5. Configurer settings.json, .mcp.json, hooks
6. Verifier les serveurs MCP

## Etape 3 — Authentification Claude AI

```powershell
claude auth login
```

Suivez les instructions pour vous connecter via votre compte Claude AI.

## Etape 4 — Installer les serveurs MCP

```powershell
git clone https://github.com/ERP-CORE-DEV/rh-optimerp-mcps.git C:\RH-OptimERP\MCPs
cd C:\RH-OptimERP\MCPs

# Builder chaque serveur MCP
cd prompt-library-orchestrator && npm install && npm run build && cd ..
cd team-sync && npm install && npm run build && cd ..
cd quality-code-orchestrator && npm install && npm run build && cd ..
```

## Etape 5 — Cloner votre microservice et commencer

```powershell
# Cloner le repo de reference
git clone https://github.com/ERP-CORE-DEV/rh-optimerp-sourcing-candidate-attraction.git
cd rh-optimerp-sourcing-candidate-attraction

# Ouvrir dans VS Code
code .
```

## Etape 6 — Verifier

Dans VS Code avec Claude Code, verifiez que les **6 serveurs MCP** se connectent:
- chrome-devtools
- github
- filesystem
- prompt-library
- team-sync
- qco (Quality Code Orchestrator)

## Mise a jour future

Quand la config est mise a jour par le lead:

```powershell
cd eagles-claude-config
git pull
.\setup_claude.ps1 -Update
```

## Vos depots personnels

Chacun a un depot personnel sur GitHub:

| Developpeur | Depot |
|-------------|-------|
| MOHAMMED-REDA | https://github.com/ERP-CORE-DEV/MOHAMMED-REDA |
| HOUSSINE | https://github.com/ERP-CORE-DEV/HOUSSINE |
| HOUDAIFA | https://github.com/ERP-CORE-DEV/HOUDAIFA |
| LAHCEN | https://github.com/ERP-CORE-DEV/LAHCEN |

## Stack technique

- **Backend**: .NET 8 (ASP.NET Core Web API), CosmosDB SDK 3.54
- **Frontend**: React 18 (TypeScript), Ant Design 5.14, Redux Toolkit
- **Infrastructure**: Azure AKS, ACR, Key Vault, Helm
- **CI/CD**: Azure Pipelines (ELYSTEK org)
- **Pattern**: Controller-Service-Repository (pas CQRS/MediatR)
- **Domaine**: RH francais (SMIC, CPF, OPCO, RNCP, CNIL, GDPR)

## En cas de probleme

Contactez **HATIM** (Lead) ou ouvrez une issue sur https://github.com/ERP-CORE-DEV/eagles-claude-config/issues

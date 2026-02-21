<#
.SYNOPSIS
    EAGLES Team - Claude Code Configuration Setup
.DESCRIPTION
    Sets up Claude Code config (~/.claude/) with shared EAGLES Pro v2.1.0:
    25 agents, 103 skills, 10 rules, 9 hooks, 10 MCP servers.
    Team: HATIM, MOHAMMED-REDA, HOUSSINE, HOUDAIFA, LAHCEN
.PARAMETER Update
    Skip backup, only overwrite agents/skills/rules/settings.
.EXAMPLE
    .\setup_claude.ps1
    .\setup_claude.ps1 -Update
#>
param(
    [switch]$Update
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$Date = Get-Date -Format "yyyy-MM-dd"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  EAGLES Pro v2.1.0 - Claude Code Config Setup" -ForegroundColor Cyan
Write-Host "  Team: RH-OptimERP (12 microservices)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Check prerequisites ---
Write-Host "[1/8] Checking prerequisites..." -ForegroundColor Yellow

$missing = @()
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) { $missing += "Node.js (https://nodejs.org/)" }
if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) { $missing += "Git (https://git-scm.com/)" }
if (-not (Get-Command "npx" -ErrorAction SilentlyContinue)) { $missing += "npx (comes with Node.js)" }

if ($missing.Count -gt 0) {
    Write-Host "  MISSING:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    Write-Host "  Install missing tools and re-run." -ForegroundColor Red
    exit 1
}
Write-Host "  OK - Node.js, Git, npx found" -ForegroundColor Green

# --- Step 2: Ask developer name ---
Write-Host ""
Write-Host "[2/8] Developer identification" -ForegroundColor Yellow

$teamMembers = @("HATIM", "MOHAMMED-REDA", "HOUSSINE", "HOUDAIFA", "LAHCEN")
Write-Host "  EAGLES team members:"
for ($i = 0; $i -lt $teamMembers.Count; $i++) {
    Write-Host "    [$($i+1)] $($teamMembers[$i])"
}
$choice = Read-Host "  Enter your number (1-$($teamMembers.Count))"
$devIndex = [int]$choice - 1
if ($devIndex -lt 0 -or $devIndex -ge $teamMembers.Count) {
    Write-Host "  Invalid choice. Exiting." -ForegroundColor Red
    exit 1
}
$DevName = $teamMembers[$devIndex]
Write-Host "  Welcome, $DevName!" -ForegroundColor Green

# --- Step 3: Backup existing config ---
if (-not $Update) {
    Write-Host ""
    Write-Host "[3/8] Checking existing config..." -ForegroundColor Yellow

    if (Test-Path $ClaudeDir) {
        $backupDir = Join-Path $env:USERPROFILE ".claude-backup-$Date"
        Write-Host "  Existing ~/.claude/ found. Backing up to $backupDir" -ForegroundColor Yellow
        Copy-Item -Path $ClaudeDir -Destination $backupDir -Recurse -Force
        Write-Host "  OK - Backup created" -ForegroundColor Green
    } else {
        Write-Host "  No existing config found. Fresh install." -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "[3/8] Update mode - skipping backup" -ForegroundColor Yellow
}

# --- Step 4: Create directory structure ---
Write-Host ""
Write-Host "[4/8] Creating directory structure..." -ForegroundColor Yellow

$dirs = @(
    $ClaudeDir,
    (Join-Path $ClaudeDir "agents"),
    (Join-Path $ClaudeDir "skills"),
    (Join-Path $ClaudeDir "rules"),
    (Join-Path $ClaudeDir "rules\common"),
    (Join-Path $ClaudeDir "rules\dotnet"),
    (Join-Path $ClaudeDir "hooks"),
    (Join-Path $ClaudeDir "docs"),
    (Join-Path $ClaudeDir "sessions"),
    (Join-Path $ClaudeDir "plans")
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Host "  OK - Directory structure created" -ForegroundColor Green

# --- Step 5: Copy agents ---
Write-Host ""
Write-Host "[5/10] Copying agents..." -ForegroundColor Yellow

$agentsSrc = Join-Path $ScriptDir "agents"
$agentsDst = Join-Path $ClaudeDir "agents"
$agentCount = (Get-ChildItem -Path $agentsSrc -Filter "*.md").Count
Copy-Item -Path "$agentsSrc\*.md" -Destination $agentsDst -Force
Write-Host "  OK - $agentCount agents installed" -ForegroundColor Green

# --- Step 6: Copy skills ---
Write-Host ""
Write-Host "[6/10] Copying skills..." -ForegroundColor Yellow

$skillsSrc = Join-Path $ScriptDir "skills"
$skillsDst = Join-Path $ClaudeDir "skills"
$skillDirs = Get-ChildItem -Path $skillsSrc -Directory
$skillCount = 0
foreach ($skillDir in $skillDirs) {
    $targetDir = Join-Path $skillsDst $skillDir.Name
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item -Path "$($skillDir.FullName)\*" -Destination $targetDir -Recurse -Force
    $skillCount++
}
Write-Host "  OK - $skillCount skills installed" -ForegroundColor Green

# --- Step 7: Copy rules + config ---
Write-Host ""
Write-Host "[7/10] Copying rules and config files..." -ForegroundColor Yellow

# Rules
Copy-Item -Path (Join-Path $ScriptDir "rules\common\*.md") -Destination (Join-Path $ClaudeDir "rules\common") -Force
Copy-Item -Path (Join-Path $ScriptDir "rules\dotnet\*.md") -Destination (Join-Path $ClaudeDir "rules\dotnet") -Force
$ruleCount = (Get-ChildItem -Path (Join-Path $ClaudeDir "rules") -Filter "*.md" -Recurse).Count
Write-Host "  OK - $ruleCount rules installed" -ForegroundColor Green

# Config files
$configSrc = Join-Path $ScriptDir "config"
Copy-Item -Path (Join-Path $configSrc "settings.json") -Destination (Join-Path $ClaudeDir "settings.json") -Force
Copy-Item -Path (Join-Path $configSrc "settings.local.json") -Destination (Join-Path $ClaudeDir "settings.local.json") -Force
Copy-Item -Path (Join-Path $configSrc "mcp.json") -Destination (Join-Path $ClaudeDir ".mcp.json") -Force
Write-Host "  OK - settings.json, .mcp.json, settings.local.json installed" -ForegroundColor Green

# --- Step 8: Copy hooks ---
Write-Host ""
Write-Host "[8/10] Copying hooks..." -ForegroundColor Yellow

$hooksSrc = Join-Path $ScriptDir "hooks"
$hooksDst = Join-Path $ClaudeDir "hooks"
if (Test-Path $hooksSrc) {
    Copy-Item -Path "$hooksSrc\*" -Destination $hooksDst -Recurse -Force
    $hookCount = (Get-ChildItem -Path $hooksDst -File).Count
    Write-Host "  OK - $hookCount hook files installed" -ForegroundColor Green
} else {
    Write-Host "  SKIP - No hooks directory found" -ForegroundColor Yellow
}

# --- Step 9: Copy docs ---
Write-Host ""
Write-Host "[9/10] Copying documentation site..." -ForegroundColor Yellow

$docsSrc = Join-Path $ScriptDir "docs"
$docsDst = Join-Path $ClaudeDir "docs"
if (Test-Path $docsSrc) {
    Copy-Item -Path "$docsSrc\*" -Destination $docsDst -Recurse -Force
    $docCount = (Get-ChildItem -Path $docsDst -File -Recurse).Count
    Write-Host "  OK - $docCount doc files installed (open docs/index.html in browser)" -ForegroundColor Green
} else {
    Write-Host "  SKIP - No docs directory found" -ForegroundColor Yellow
}

# --- Step 10: Build MCP servers ---
Write-Host ""
Write-Host "[10/10] Checking MCP servers..." -ForegroundColor Yellow

$mcpBase = "C:\RH-OptimERP\MCPs"
$mcpServers = @("prompt-library-orchestrator", "team-sync", "quality-code-orchestrator")
if (Test-Path $mcpBase) {
    foreach ($server in $mcpServers) {
        $serverPath = Join-Path $mcpBase $server
        $distPath = Join-Path $serverPath "dist\index.js"
        if (Test-Path $serverPath) {
            if (-not (Test-Path $distPath)) {
                Write-Host "  Building $server..." -ForegroundColor Yellow
                Push-Location $serverPath
                npm install --silent 2>$null
                npm run build --silent 2>$null
                Pop-Location
            }
            Write-Host "  OK - $server ready" -ForegroundColor Green
        } else {
            Write-Host "  SKIP - $server not found at $serverPath" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  WARN - $mcpBase not found. MCP servers will need manual setup." -ForegroundColor Yellow
    Write-Host "  Clone MCPs repo and run: npm install && npm run build" -ForegroundColor Yellow
}

# --- Done ---
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Setup complete for $DevName!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed:" -ForegroundColor White
Write-Host "    - $agentCount agents" -ForegroundColor White
Write-Host "    - $skillCount skills" -ForegroundColor White
Write-Host "    - $ruleCount rules" -ForegroundColor White
Write-Host "    - 177 permissions (6 deny rules)" -ForegroundColor White
Write-Host "    - 9 hooks" -ForegroundColor White
Write-Host "    - 10 MCP servers" -ForegroundColor White
Write-Host "    - 17 doc files (HTML site)" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Run: claude auth login" -ForegroundColor White
Write-Host "    2. Clone your microservice repo" -ForegroundColor White
Write-Host "    3. Open in VS Code with Claude Code extension" -ForegroundColor White
Write-Host "    4. Verify: all 10 MCP servers should connect" -ForegroundColor White
Write-Host "    5. Open ~/.claude/docs/index.html in browser for documentation" -ForegroundColor White
Write-Host ""
Write-Host "  Note: GITHUB_PERSONAL_ACCESS_TOKEN is already in .mcp.json" -ForegroundColor Gray
Write-Host "  Make sure it is set in your system environment variables." -ForegroundColor Gray
Write-Host ""
Write-Host "  To update later: git pull && .\setup_claude.ps1 -Update" -ForegroundColor Gray
Write-Host ""

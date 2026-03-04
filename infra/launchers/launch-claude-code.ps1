# EAGLES AI Platform - Launch VS Code with Claude Code proxy routing
# Usage: .\launch-claude-code.ps1 [optional-workspace-path]
# If no path given, opens the eagles-ai-platform folder

param(
    [string]$WorkspacePath
)

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Default to eagles-ai-platform if no workspace specified
if (-not $WorkspacePath) {
    $WorkspacePath = $SCRIPT_DIR
}

# Resolve to absolute path
$WorkspacePath = (Resolve-Path $WorkspacePath -ErrorAction SilentlyContinue).Path
if (-not $WorkspacePath) {
    Write-Host "ERROR: Path not found!" -ForegroundColor Red
    exit 1
}

# Load .env file
$envFile = Join-Path $SCRIPT_DIR ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
            }
        }
    }
}

# Set Claude Code routing env vars — ALL traffic goes through proxy
$env:ANTHROPIC_BASE_URL = "http://localhost:4000"
$env:ANTHROPIC_API_KEY = "sk-eagles-proxy-local"

Write-Host "=== EAGLES AI Platform - Claude Code Launcher ===" -ForegroundColor Cyan
Write-Host "ANTHROPIC_BASE_URL = $env:ANTHROPIC_BASE_URL" -ForegroundColor Green
Write-Host "ANTHROPIC_API_KEY  = $($env:ANTHROPIC_API_KEY.Substring(0,10))..." -ForegroundColor Green
Write-Host "Workspace          = $WorkspacePath" -ForegroundColor Green
Write-Host ""

# Check if proxy is running (quick check on /v1/models, not /health which is slow)
try {
    $null = Invoke-WebRequest -Uri "http://localhost:4000/v1/models" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "Proxy is RUNNING" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Proxy is NOT running on port 4000!" -ForegroundColor Red
    Write-Host "Start it first: python $SCRIPT_DIR\start-litellm.py" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Launch VS Code anyway? (y/n)"
    if ($continue -ne "y") { exit 1 }
}

Write-Host ""
Write-Host "Launching VS Code for: $WorkspacePath" -ForegroundColor Cyan
Write-Host "All Claude Code traffic -> Kimi K2 Thinking (Azure credits)" -ForegroundColor Yellow
# Use separate user-data-dir to force an independent VS Code server process
# This ensures proxy env vars are inherited (not shared with existing VS Code)
$eaglesDataDir = Join-Path $env:LOCALAPPDATA "vscode-eagles"
code --new-window --user-data-dir "$eaglesDataDir" "$WorkspacePath"

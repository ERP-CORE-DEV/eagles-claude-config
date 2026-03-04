@echo off
REM EAGLES AI Platform - Launch Claude Code with Kimi proxy routing
REM Usage: LAUNCH_CLAUDE_CODE.bat [optional-workspace-path]
REM Example: LAUNCH_CLAUDE_CODE.bat C:\rh-optimerp-sourcing-candidate-attraction

powershell -ExecutionPolicy Bypass -File "%~dp0launch-claude-code.ps1" %*
pause

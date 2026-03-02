#!/usr/bin/env bash
set -euo pipefail

# EAGLES Advanced — One-shot setup script
# Creates .data directories and runs initial pnpm install

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[setup] Creating .data directories..."
mkdir -p "$PROJECT_ROOT/.data/vector-store"
mkdir -p "$PROJECT_ROOT/.data/token-ledger"
mkdir -p "$PROJECT_ROOT/.data/drift-reports"
mkdir -p "$PROJECT_ROOT/.data/event-bus"

echo "[setup] Installing dependencies..."
cd "$PROJECT_ROOT"
pnpm install

echo "[setup] Building all packages (ordered)..."
pnpm run build:ordered

echo "[setup] Done. Run 'pnpm smoke-test' to verify."

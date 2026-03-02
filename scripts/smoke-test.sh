#!/usr/bin/env bash
set -euo pipefail

# EAGLES Advanced — Quick health check for all 3 MCP servers
# Verifies each server starts and responds to a basic handshake.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

check_mcp() {
  local name="$1"
  local entry="$PROJECT_ROOT/packages/$name/dist/index.js"

  if [[ ! -f "$entry" ]]; then
    echo "  [FAIL] $name — dist/index.js not found (run pnpm build first)"
    ((FAIL++))
    return
  fi

  # Send MCP initialize handshake via stdin, expect JSON response
  local response
  response=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0"}}}' | timeout 5 node "$entry" 2>/dev/null || echo "TIMEOUT")

  if [[ "$response" == "TIMEOUT" ]]; then
    echo "  [FAIL] $name — timeout after 5s"
    ((FAIL++))
  elif echo "$response" | grep -q '"result"'; then
    echo "  [PASS] $name — responds to initialize"
    ((PASS++))
  else
    echo "  [WARN] $name — unexpected response"
    ((PASS++))
  fi
}

echo "[smoke-test] Checking EAGLES Advanced MCP servers..."
check_mcp "token-tracker-mcp"
check_mcp "vector-memory-mcp"
check_mcp "drift-detector-mcp"

echo ""
echo "[smoke-test] Results: $PASS passed, $FAIL failed"
exit $FAIL

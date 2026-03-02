#!/usr/bin/env bash
set -euo pipefail

# Register EAGLES Advanced MCP servers in ~/.claude.json
# Adds token-tracker, vector-memory, and drift-detector entries
# without touching existing Classic MCP entries.

CLAUDE_JSON="$HOME/.claude.json"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_ROOT="$PROJECT_ROOT/.data"

echo "[register] Adding EAGLES Advanced MCPs to $CLAUDE_JSON"
echo "[register] Project root: $PROJECT_ROOT"
echo "[register] Data root: $DATA_ROOT"

# Use Python to safely merge MCP entries into existing config
python3 -c "
import json, sys

config_path = '$CLAUDE_JSON'.replace('\\\\', '/')
project_root = '$PROJECT_ROOT'.replace('\\\\', '/')
data_root = '$DATA_ROOT'.replace('\\\\', '/')

with open(config_path, 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

new_servers = {
    'token-tracker': {
        'type': 'stdio',
        'command': 'node',
        'args': [f'{project_root}/packages/token-tracker-mcp/dist/index.js'],
        'env': {'EAGLES_DATA_ROOT': data_root}
    },
    'vector-memory': {
        'type': 'stdio',
        'command': 'node',
        'args': [f'{project_root}/packages/vector-memory-mcp/dist/index.js'],
        'env': {'EAGLES_DATA_ROOT': data_root}
    },
    'drift-detector': {
        'type': 'stdio',
        'command': 'node',
        'args': [f'{project_root}/packages/drift-detector-mcp/dist/index.js'],
        'env': {'EAGLES_DATA_ROOT': data_root}
    }
}

for name, server_config in new_servers.items():
    if name in config['mcpServers']:
        print(f'  [skip] {name} already registered')
    else:
        config['mcpServers'][name] = server_config
        print(f'  [add] {name}')

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print('[register] Done. Restart VS Code to activate new MCPs.')
"

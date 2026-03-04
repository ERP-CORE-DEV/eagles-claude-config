#!/bin/bash
# =============================================================
# Test EAGLES AI Platform LiteLLM Gateway
# =============================================================
set -euo pipefail

LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
LITELLM_KEY="${LITELLM_KEY:-sk-eagles-local-test-1234}"

echo "=== EAGLES AI Platform - Gateway Test ==="
echo "URL: $LITELLM_URL"
echo ""

# Test 1: Health
echo "1. Health check..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LITELLM_URL/health/liveliness" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "   OK (200)"
else
  echo "   FAILED ($HTTP_CODE) - is LiteLLM running? Try: docker compose up -d"
  exit 1
fi
echo ""

# Test 2: Models
echo "2. Available models:"
curl -s -H "Authorization: Bearer $LITELLM_KEY" "$LITELLM_URL/v1/models" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('data', []):
        print(f\"   - {m['id']}\")
except: print('   (could not parse)')
"
echo ""

# Test 3: Chat completion (OpenAI format)
echo "3. Chat completion test (OpenAI format)..."
echo "   Sending: 'What model are you? One sentence.'"
RESPONSE=$(curl -s "$LITELLM_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "What model are you? Reply in one sentence."}
    ]
  }' 2>/dev/null)

echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msg = data['choices'][0]['message']['content']
    model = data.get('model', 'unknown')
    print(f'   Model: {model}')
    print(f'   Response: {msg[:200]}')
except Exception as e:
    print(f'   Error: {e}')
    print(f'   Raw: {sys.stdin.read()[:300]}')
"
echo ""

# Test 4: Code generation
echo "4. Code generation test..."
echo "   Sending: 'Write a C# repository interface for CosmosDB'"
RESPONSE=$(curl -s "$LITELLM_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 300,
    "messages": [
      {"role": "user", "content": "Write a C# IRepository<T> interface for CosmosDB with GetById, Query, Create, Update, Delete methods. Just the code."}
    ]
  }' 2>/dev/null)

echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msg = data['choices'][0]['message']['content']
    model = data.get('model', 'unknown')
    usage = data.get('usage', {})
    print(f'   Model: {model}')
    print(f'   Tokens: {usage.get(\"prompt_tokens\",\"?\")} in / {usage.get(\"completion_tokens\",\"?\")} out')
    print(f'   Response (first 500 chars):')
    for line in msg[:500].split('\n'):
        print(f'   {line}')
except Exception as e:
    print(f'   Error parsing: {e}')
"
echo ""

echo "=== All tests complete ==="
echo ""
echo "To connect Claude Code to this gateway:"
echo "  export ANTHROPIC_BASE_URL=$LITELLM_URL"
echo "  export ANTHROPIC_AUTH_TOKEN=$LITELLM_KEY"

# ADR-003: Embedding Strategy for Vector Memory

**Status:** Accepted
**Date:** 2026-03-02

## Context

Vector memory search requires an embedding model. Options: Azure OpenAI
`text-embedding-3-small` (1536 dims) or local `@xenova/transformers` with
`all-MiniLM-L6-v2` (384 dims).

## Decision

Default to local `@xenova/transformers` with `all-MiniLM-L6-v2` for zero-cost,
offline operation. The model downloads ~90MB on first run and caches in
`~/.cache/huggingface/hub/`. Embeddings are 384-dimensional float32 vectors.

ONNX Runtime logs to stdout, which conflicts with MCP stdio transport.
Set `env.backends.onnx.logLevel = 'error'` before loading the model.

## Consequences

- **Positive**: Zero API cost, works offline, ~15ms per embedding.
- **Negative**: First-run download, 384 dims (vs 1536 with Azure).
- **Neutral**: Can add Azure fallback later without schema changes.

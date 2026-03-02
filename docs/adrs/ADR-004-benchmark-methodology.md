# ADR-004: Benchmark Methodology

**Status:** Accepted
**Date:** 2026-03-02

## Context

Comparing Classic vs Advanced requires reproducible conditions despite
LLM stochastic behavior. The benchmark must measure cost, quality, and
efficiency dimensions while handling asymmetric metrics (drift data is
Advanced-only).

## Decision

1. Content-address task specs with SHA-256 to guarantee identical input.
2. Pin model (claude-sonnet-4-6), set temperature=0 via proxy config.
3. Sequential runs (not parallel) to avoid LiteLLM proxy quota contention.
4. JSONL event log for raw data; wave checkpoints for summaries.
5. Classic drift metrics reported as `null` with reason annotation,
   not as zero (honest absence > fake data).

## Consequences

- **Positive**: Reproducible, honest comparison with clear methodology.
- **Negative**: Sequential runs take 2x wall-clock time.
- **Neutral**: Token-tracker MCP is a hard prerequisite for both runs.

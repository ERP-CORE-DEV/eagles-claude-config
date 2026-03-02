# ADR-002: SQLite Event Bus Over File-Based JSON

**Status:** Accepted
**Date:** 2026-03-02

## Context

The drift detector needs token usage data from the token tracker. EAGLES Classic
uses JSON files on disk for inter-component communication. On Windows with
multiple concurrent Node processes (MCP servers), file-based JSON polling risks
partial-read corruption (no fsync coordination).

## Decision

Use a single `bus.sqlite` file with WAL journal mode as the inter-MCP event bus.
SQLite WAL allows one writer and multiple concurrent readers without blocking.

## Consequences

- **Positive**: Atomic writes, indexed queries, no file-handle races on Windows.
- **Negative**: Adds `better-sqlite3` as a native dependency requiring node-gyp.
- **Neutral**: The SQLite file is gitignored and initialized by `scripts/setup.sh`.

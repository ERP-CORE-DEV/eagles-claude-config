# ADR-001: Monorepo Structure

**Status:** Accepted
**Date:** 2026-03-02

## Context

EAGLES Classic uses flat NPM workspaces with individual `npm install` per MCP.
Three new MCPs share types, constants, and a data layer. Building them as
separate standalone packages would duplicate code and create version drift.

## Decision

Build `C:\RH-OptimERP\eagles-advanced\` as a pnpm monorepo with 6 packages:
3 MCP servers, 1 shared utilities library, 1 data-layer package, 1 benchmark.

## Consequences

- **Positive**: Single `pnpm build` for all, typed inter-MCP contracts, Vitest
  workspace runs tests in parallel, CI enforces build order.
- **Negative**: pnpm workspace adds toolchain complexity. Team must install pnpm.
- **Neutral**: EAGLES Classic is never modified.

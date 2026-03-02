import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { TokenLedger } from "../src/TokenLedger.js";

describe("TokenLedger", () => {
  let ledger: TokenLedger;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    ledger = new TokenLedger(join(testDir, "test-ledger.sqlite"));
  });

  afterEach(() => {
    ledger.close();
  });

  it("should insert a token record and return it with computed fields", () => {
    const record = ledger.insert({
      sessionId: "session-1",
      modelName: "claude-sonnet-4-6",
      promptTokens: 1000,
      completionTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      waveNumber: 1,
      agentName: "orchestrator",
      toolName: "Read",
    });

    expect(record.id).toBeDefined();
    expect(record.totalTokens).toBe(1500);
    expect(record.estimatedCostUsd).toBeGreaterThan(0);
    expect(record.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should calculate cost correctly for claude-sonnet-4-6", () => {
    const record = ledger.insert({
      sessionId: "session-1",
      modelName: "claude-sonnet-4-6",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      waveNumber: null,
      agentName: null,
      toolName: null,
    });

    // Input: 1M * $3/MTok = $3.00, Output: 1M * $15/MTok = $15.00
    expect(record.estimatedCostUsd).toBeCloseTo(18.0, 1);
  });

  it("should apply cache read discount", () => {
    const record = ledger.insert({
      sessionId: "session-1",
      modelName: "claude-sonnet-4-6",
      promptTokens: 1_000_000,
      completionTokens: 0,
      cacheReadTokens: 500_000,
      cacheWriteTokens: 0,
      waveNumber: null,
      agentName: null,
      toolName: null,
    });

    // Regular: 500K * $3/MTok = $1.50
    // Cache read: 500K * $3/MTok * 0.1 = $0.15
    // Total: $1.65
    expect(record.estimatedCostUsd).toBeCloseTo(1.65, 1);
  });

  it("should return 0 cost for unknown model", () => {
    const record = ledger.insert({
      sessionId: "session-1",
      modelName: "unknown-model-xyz",
      promptTokens: 1000,
      completionTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      waveNumber: null,
      agentName: null,
      toolName: null,
    });

    expect(record.estimatedCostUsd).toBe(0);
  });

  it("should sum costs within a time window", () => {
    ledger.insert({
      sessionId: "session-1",
      modelName: "claude-sonnet-4-6",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      waveNumber: null,
      agentName: null,
      toolName: null,
    });

    ledger.insert({
      sessionId: "session-1",
      modelName: "claude-haiku-4-5",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      waveNumber: null,
      agentName: null,
      toolName: null,
    });

    const total = ledger.sumCost(30);
    // Sonnet: $18.00, Haiku: $0.80 + $4.00 = $4.80
    expect(total).toBeCloseTo(22.8, 0);
  });

  it("should return 0 for empty ledger", () => {
    expect(ledger.sumCost(30)).toBe(0);
  });
});

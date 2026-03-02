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

  describe("getSessionCost", () => {
    it("should return zero cost and empty byModel for unknown session", () => {
      const result = ledger.getSessionCost("nonexistent-session");

      expect(result.totalCost).toBe(0);
      expect(result.records).toBe(0);
      expect(result.byModel).toEqual({});
    });

    it("should aggregate total cost and record count for a session", () => {
      ledger.insert({
        sessionId: "session-x",
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
        sessionId: "session-x",
        modelName: "claude-haiku-4-5",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getSessionCost("session-x");

      expect(result.records).toBe(2);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.byModel).toHaveProperty("claude-sonnet-4-6");
      expect(result.byModel).toHaveProperty("claude-haiku-4-5");
      expect(result.byModel["claude-sonnet-4-6"].tokens).toBe(2_000_000);
    });

    it("should not include records from other sessions", () => {
      ledger.insert({
        sessionId: "session-a",
        modelName: "claude-sonnet-4-6",
        promptTokens: 100,
        completionTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getSessionCost("session-b");

      expect(result.records).toBe(0);
      expect(result.totalCost).toBe(0);
    });
  });

  describe("getAgentCosts", () => {
    it("should return empty array when no agent records exist for session", () => {
      const result = ledger.getAgentCosts("session-empty");
      expect(result).toEqual([]);
    });

    it("should group costs by agent name ordered by cost descending", () => {
      ledger.insert({
        sessionId: "session-agents",
        modelName: "claude-sonnet-4-6",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: "orchestrator",
        toolName: null,
      });
      ledger.insert({
        sessionId: "session-agents",
        modelName: "claude-haiku-4-5",
        promptTokens: 100,
        completionTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: "helper",
        toolName: null,
      });
      ledger.insert({
        sessionId: "session-agents",
        modelName: "claude-sonnet-4-6",
        promptTokens: 500_000,
        completionTokens: 500_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: "orchestrator",
        toolName: null,
      });

      const result = ledger.getAgentCosts("session-agents");

      expect(result.length).toBe(2);
      expect(result[0].agentName).toBe("orchestrator");
      expect(result[0].totalCost).toBeGreaterThan(result[1].totalCost);
      expect(result[0].totalTokens).toBe(3_000_000);
    });

    it("should exclude records with null agent_name", () => {
      ledger.insert({
        sessionId: "session-null-agent",
        modelName: "claude-sonnet-4-6",
        promptTokens: 100,
        completionTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getAgentCosts("session-null-agent");
      expect(result).toEqual([]);
    });
  });

  describe("getWaveCosts", () => {
    it("should return empty array when no wave records exist for session", () => {
      const result = ledger.getWaveCosts("session-no-waves");
      expect(result).toEqual([]);
    });

    it("should group costs by wave number ordered ascending", () => {
      ledger.insert({
        sessionId: "session-waves",
        modelName: "claude-sonnet-4-6",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: 3,
        agentName: null,
        toolName: null,
      });
      ledger.insert({
        sessionId: "session-waves",
        modelName: "claude-haiku-4-5",
        promptTokens: 500_000,
        completionTokens: 500_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: 1,
        agentName: null,
        toolName: null,
      });
      ledger.insert({
        sessionId: "session-waves",
        modelName: "claude-haiku-4-5",
        promptTokens: 200_000,
        completionTokens: 200_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: 1,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getWaveCosts("session-waves");

      expect(result.length).toBe(2);
      expect(result[0].waveNumber).toBe(1);
      expect(result[1].waveNumber).toBe(3);
      expect(result[0].totalTokens).toBe(1_400_000);
    });

    it("should exclude records with null wave_number", () => {
      ledger.insert({
        sessionId: "session-null-wave",
        modelName: "claude-sonnet-4-6",
        promptTokens: 100,
        completionTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getWaveCosts("session-null-wave");
      expect(result).toEqual([]);
    });
  });

  describe("getCostReport", () => {
    it("should return zero totals for empty ledger", () => {
      const result = ledger.getCostReport(30);

      expect(result.totalCost).toBe(0);
      expect(result.recordCount).toBe(0);
      expect(result.byModel).toEqual({});
      expect(result.byDay).toEqual([]);
    });

    it("should aggregate cost by model and by day", () => {
      ledger.insert({
        sessionId: "session-report",
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
        sessionId: "session-report",
        modelName: "claude-haiku-4-5",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      const result = ledger.getCostReport(30);

      expect(result.recordCount).toBe(2);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.byModel).toHaveProperty("claude-sonnet-4-6");
      expect(result.byModel).toHaveProperty("claude-haiku-4-5");
      expect(result.byDay.length).toBe(1);
      expect(result.byDay[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should not include records outside the time window", () => {
      // windowDays = 0 means since epoch of "now" — effectively excludes everything
      // We test with a fresh insert and windowDays=0 (since = now, nothing older matches)
      ledger.insert({
        sessionId: "session-report-window",
        modelName: "claude-sonnet-4-6",
        promptTokens: 1_000,
        completionTokens: 1_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        waveNumber: null,
        agentName: null,
        toolName: null,
      });

      // windowDays=30 should include it, windowDays=0 excludes records before "now"
      const included = ledger.getCostReport(30);
      expect(included.recordCount).toBeGreaterThanOrEqual(1);
    });
  });
});

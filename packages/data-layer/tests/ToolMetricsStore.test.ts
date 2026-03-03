import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { ToolMetricsStore } from "../src/ToolMetricsStore.js";

describe("ToolMetricsStore", () => {
  let store: ToolMetricsStore;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "tool-metrics-test-"));
    store = new ToolMetricsStore(join(testDir, "test-metrics.sqlite"));
  });

  afterEach(() => {
    store.close();
  });

  describe("record", () => {
    it("should record a metric and return it with an id", () => {
      const record = store.record({
        toolName: "memory_search",
        durationMs: 42.5,
        success: true,
        serverName: "vector-memory",
      });

      expect(record.id).toBeDefined();
      expect(record.toolName).toBe("memory_search");
      expect(record.durationMs).toBe(42.5);
      expect(record.success).toBe(true);
      expect(record.serverName).toBe("vector-memory");
      expect(record.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should increment count after recording", () => {
      expect(store.count()).toBe(0);
      store.record({ toolName: "t1", durationMs: 10, success: true, serverName: "s" });
      store.record({ toolName: "t2", durationMs: 20, success: true, serverName: "s" });
      expect(store.count()).toBe(2);
    });
  });

  describe("getPercentiles", () => {
    it("should return null for unknown tool", () => {
      expect(store.getPercentiles("nonexistent")).toBeNull();
    });

    it("should compute percentiles for a tool", () => {
      for (let i = 1; i <= 100; i++) {
        store.record({ toolName: "Read", durationMs: i, success: true, serverName: "core" });
      }

      const p = store.getPercentiles("Read");
      expect(p).not.toBeNull();
      expect(p!.toolName).toBe("Read");
      expect(p!.count).toBe(100);
      expect(p!.p50).toBe(50);
      expect(p!.p95).toBe(95);
      expect(p!.p99).toBe(99);
      expect(p!.avgMs).toBeCloseTo(50.5, 0);
      expect(p!.successRate).toBe(1);
    });

    it("should compute success rate correctly", () => {
      store.record({ toolName: "flaky", durationMs: 10, success: true, serverName: "s" });
      store.record({ toolName: "flaky", durationMs: 20, success: false, serverName: "s" });
      store.record({ toolName: "flaky", durationMs: 15, success: true, serverName: "s" });
      store.record({ toolName: "flaky", durationMs: 50, success: false, serverName: "s" });

      const p = store.getPercentiles("flaky");
      expect(p!.successRate).toBe(0.5);
      expect(p!.count).toBe(4);
    });

    it("should filter by window days", () => {
      // All records are "now" so windowDays=30 should include them
      for (let i = 0; i < 5; i++) {
        store.record({ toolName: "Write", durationMs: i * 10, success: true, serverName: "s" });
      }

      const included = store.getPercentiles("Write", 30);
      expect(included).not.toBeNull();
      expect(included!.count).toBe(5);
    });
  });

  describe("getTopSlowest", () => {
    it("should return empty array for empty store", () => {
      const result = store.getTopSlowest(10);
      expect(result).toEqual([]);
    });

    it("should return tools ordered by average duration descending", () => {
      // fast tool: avg 5ms
      for (let i = 0; i < 5; i++) {
        store.record({ toolName: "fast_tool", durationMs: 5, success: true, serverName: "s" });
      }
      // slow tool: avg 100ms
      for (let i = 0; i < 5; i++) {
        store.record({ toolName: "slow_tool", durationMs: 100, success: true, serverName: "s" });
      }
      // medium tool: avg 50ms
      for (let i = 0; i < 5; i++) {
        store.record({ toolName: "medium_tool", durationMs: 50, success: true, serverName: "s" });
      }

      const result = store.getTopSlowest(3);
      expect(result).toHaveLength(3);
      expect(result[0].toolName).toBe("slow_tool");
      expect(result[1].toolName).toBe("medium_tool");
      expect(result[2].toolName).toBe("fast_tool");
    });

    it("should respect limit parameter", () => {
      store.record({ toolName: "a", durationMs: 10, success: true, serverName: "s" });
      store.record({ toolName: "b", durationMs: 20, success: true, serverName: "s" });
      store.record({ toolName: "c", durationMs: 30, success: true, serverName: "s" });

      const result = store.getTopSlowest(2);
      expect(result).toHaveLength(2);
    });

    it("should track max duration", () => {
      store.record({ toolName: "t", durationMs: 10, success: true, serverName: "s" });
      store.record({ toolName: "t", durationMs: 100, success: true, serverName: "s" });
      store.record({ toolName: "t", durationMs: 50, success: true, serverName: "s" });

      const result = store.getTopSlowest(1);
      expect(result[0].maxMs).toBe(100);
    });
  });

  describe("getAllToolNames", () => {
    it("should return sorted unique tool names", () => {
      store.record({ toolName: "Write", durationMs: 10, success: true, serverName: "s" });
      store.record({ toolName: "Read", durationMs: 20, success: true, serverName: "s" });
      store.record({ toolName: "Write", durationMs: 15, success: true, serverName: "s" });
      store.record({ toolName: "Bash", durationMs: 5, success: true, serverName: "s" });

      const names = store.getAllToolNames();
      expect(names).toEqual(["Bash", "Read", "Write"]);
    });
  });
});

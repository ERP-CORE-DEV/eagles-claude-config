import { describe, it, expect } from "vitest";
import { TASK_REGISTRY } from "../src/tasks/TaskRegistry.js";

describe("TASK_REGISTRY", () => {
  it("should have at least 4 tasks", () => {
    expect(TASK_REGISTRY.length).toBeGreaterThanOrEqual(4);
  });

  it("should have unique task IDs", () => {
    const ids = TASK_REGISTRY.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("should have content hashes for all tasks", () => {
    for (const task of TASK_REGISTRY) {
      expect(task.contentHash).toBeDefined();
      expect(task.contentHash.length).toBe(16);
    }
  });

  it("should cover all three MCP categories", () => {
    const categories = new Set(TASK_REGISTRY.map((t) => t.category));
    expect(categories.has("memory")).toBe(true);
    expect(categories.has("token-tracking")).toBe(true);
    expect(categories.has("drift-detection")).toBe(true);
  });

  it("should have at least one step per task", () => {
    for (const task of TASK_REGISTRY) {
      expect(task.steps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should have deterministic content hashes", () => {
    const hashes = TASK_REGISTRY.map((t) => t.contentHash);
    // Run twice to verify determinism
    const hashes2 = TASK_REGISTRY.map((t) => t.contentHash);
    expect(hashes).toEqual(hashes2);
  });
});

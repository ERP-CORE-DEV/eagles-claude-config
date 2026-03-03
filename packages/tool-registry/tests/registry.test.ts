import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../src/registry.js";
import type { RegisteredTool } from "../src/types.js";

const SAMPLE_DEFINITION = {
  name: "memory_search",
  description: "Search vector memory for relevant entries",
  category: "memory",
  tags: ["search", "vector"] as const,
  serverName: "vector-memory",
  inputSchema: { query: { type: "string" }, limit: { type: "number" } },
} as const;

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("register", () => {
    it("should register a tool and retrieve it by name", () => {
      const registered = registry.register(SAMPLE_DEFINITION);

      expect(registered.definition.name).toBe("memory_search");
      expect(registered.definition.description).toBe("Search vector memory for relevant entries");
      expect(registered.definition.category).toBe("memory");
      expect(registered.definition.serverName).toBe("vector-memory");
      expect(registered.definition.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(registered.metadata.callCount).toBe(0);
      expect(registered.metadata.avgLatencyMs).toBe(0);
      expect(registered.metadata.lastCalledAt).toBeNull();
    });

    it("should retrieve a registered tool with get()", () => {
      registry.register(SAMPLE_DEFINITION);

      const found = registry.get("memory_search");

      expect(found).not.toBeNull();
      expect(found!.definition.name).toBe("memory_search");
    });

    it("should throw when registering a tool with an invalid name", () => {
      expect(() =>
        registry.register({ ...SAMPLE_DEFINITION, name: "1invalid-name" }),
      ).toThrow(/Invalid tool name/);
    });

    it("should throw when registering a tool with a name containing spaces", () => {
      expect(() =>
        registry.register({ ...SAMPLE_DEFINITION, name: "invalid name" }),
      ).toThrow(/Invalid tool name/);
    });
  });

  describe("get", () => {
    it("should return null for a tool that does not exist", () => {
      expect(registry.get("nonexistent_tool")).toBeNull();
    });
  });

  describe("findByCategory", () => {
    it("should return all tools in the given category", () => {
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_search", category: "memory" });
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_store", category: "memory" });
      registry.register({ ...SAMPLE_DEFINITION, name: "token_track", category: "tracking", tags: [] });

      const memoryTools = registry.findByCategory("memory");

      expect(memoryTools).toHaveLength(2);
      const names = memoryTools.map((t) => t.definition.name);
      expect(names).toContain("memory_search");
      expect(names).toContain("memory_store");
    });

    it("should return empty array for unknown category", () => {
      expect(registry.findByCategory("nonexistent")).toEqual([]);
    });
  });

  describe("findByTag", () => {
    it("should return all tools with the given tag", () => {
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_search", tags: ["search", "vector"] });
      registry.register({ ...SAMPLE_DEFINITION, name: "token_search", category: "tracking", tags: ["search"] });
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_store", tags: ["vector", "store"] });

      const searchTools = registry.findByTag("search");

      expect(searchTools).toHaveLength(2);
      const names = searchTools.map((t) => t.definition.name);
      expect(names).toContain("memory_search");
      expect(names).toContain("token_search");
    });

    it("should return empty array for unknown tag", () => {
      expect(registry.findByTag("nonexistent")).toEqual([]);
    });
  });

  describe("recordCall", () => {
    it("should increment callCount after each call", () => {
      registry.register(SAMPLE_DEFINITION);

      registry.recordCall("memory_search", 50);
      registry.recordCall("memory_search", 100);

      const tool = registry.get("memory_search");
      expect(tool!.metadata.callCount).toBe(2);
    });

    it("should compute incremental average latency correctly", () => {
      registry.register(SAMPLE_DEFINITION);

      registry.recordCall("memory_search", 100);
      registry.recordCall("memory_search", 200);
      registry.recordCall("memory_search", 300);

      const tool = registry.get("memory_search");
      expect(tool!.metadata.callCount).toBe(3);
      expect(tool!.metadata.avgLatencyMs).toBeCloseTo(200, 5);
    });

    it("should update lastCalledAt after a call", () => {
      registry.register(SAMPLE_DEFINITION);

      expect(registry.get("memory_search")!.metadata.lastCalledAt).toBeNull();
      registry.recordCall("memory_search", 42);

      const tool = registry.get("memory_search");
      expect(tool!.metadata.lastCalledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should silently ignore recordCall for unknown tool", () => {
      expect(() => registry.recordCall("nonexistent", 100)).not.toThrow();
    });
  });

  describe("unregister", () => {
    it("should remove a tool and return true", () => {
      registry.register(SAMPLE_DEFINITION);

      const result = registry.unregister("memory_search");

      expect(result).toBe(true);
      expect(registry.get("memory_search")).toBeNull();
    });

    it("should remove tool from category index after unregister", () => {
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_search", category: "memory" });
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_store", category: "memory" });

      registry.unregister("memory_search");

      const remaining = registry.findByCategory("memory");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].definition.name).toBe("memory_store");
    });

    it("should remove tool from tag indexes after unregister", () => {
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_search", tags: ["search", "vector"] });
      registry.register({ ...SAMPLE_DEFINITION, name: "memory_store", tags: ["vector", "store"] });

      registry.unregister("memory_search");

      expect(registry.findByTag("search")).toHaveLength(0);
      const vectorTools = registry.findByTag("vector");
      expect(vectorTools).toHaveLength(1);
      expect(vectorTools[0].definition.name).toBe("memory_store");
    });

    it("should return false when unregistering a tool that does not exist", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("should return all registered tools", () => {
      registry.register({ ...SAMPLE_DEFINITION, name: "tool_a" });
      registry.register({ ...SAMPLE_DEFINITION, name: "tool_b" });
      registry.register({ ...SAMPLE_DEFINITION, name: "tool_c" });

      const all: RegisteredTool[] = registry.list();

      expect(all).toHaveLength(3);
      const names = all.map((t) => t.definition.name);
      expect(names).toContain("tool_a");
      expect(names).toContain("tool_b");
      expect(names).toContain("tool_c");
    });

    it("should return empty array when no tools are registered", () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe("count", () => {
    it("should return correct count after registrations and unregistrations", () => {
      expect(registry.count()).toBe(0);

      registry.register({ ...SAMPLE_DEFINITION, name: "tool_a" });
      registry.register({ ...SAMPLE_DEFINITION, name: "tool_b" });
      expect(registry.count()).toBe(2);

      registry.unregister("tool_a");
      expect(registry.count()).toBe(1);
    });
  });
});

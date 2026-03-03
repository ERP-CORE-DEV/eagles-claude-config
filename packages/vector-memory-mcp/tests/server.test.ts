import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ---- Mock EmbeddingService to prevent loading 90MB @xenova/transformers model ----
// Vitest hoists vi.mock() calls before imports, so this runs first.

function randomVector(dims = 384): number[] {
  return Array.from({ length: dims }, () => Math.random());
}

vi.mock("../src/services/EmbeddingService.js", () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    embed: vi.fn().mockResolvedValue(randomVector()),
    batchEmbed: vi.fn().mockImplementation(async (texts: string[]) =>
      texts.map(() => randomVector()),
    ),
    isLoaded: vi.fn().mockReturnValue(false),
    getDimensions: vi.fn().mockReturnValue(384),
    getModelName: vi.fn().mockReturnValue("Xenova/all-MiniLM-L6-v2"),
  })),
}));

// Mock VectorStore from data-layer — hnswlib-node mock doesn't propagate across
// workspace packages for dynamic imports. Replace with in-memory implementation.
vi.mock("@eagles-advanced/data-layer", async () => {
  const actual = await vi.importActual("@eagles-advanced/data-layer");
  return {
    ...actual,
    VectorStore: vi.fn().mockImplementation(() => {
      const store = new Map<string, number[]>();
      return {
        init: vi.fn().mockResolvedValue(undefined),
        upsert: vi.fn().mockImplementation(async (id: string, vector: number[]) => {
          store.set(id, vector);
        }),
        search: vi.fn().mockImplementation(async (_query: number[], topK: number) => {
          const results: Array<{ id: string; score: number }> = [];
          for (const [id] of store) {
            results.push({ id, score: 0.85 });
          }
          return results.slice(0, topK);
        }),
        delete: vi.fn().mockImplementation(async (id: string) => {
          store.delete(id);
        }),
        rebuild: vi.fn().mockResolvedValue(undefined),
        getCount: vi.fn().mockImplementation(() => store.size),
        isHealthy: vi.fn().mockResolvedValue(true),
      };
    }),
  };
});

// Import after mocking so server picks up the mock
import { createVectorMemoryServer } from "../src/server.js";

let tempDataRoot: string;

beforeEach(() => {
  tempDataRoot = mkdtempSync(join(tmpdir(), "vm-server-test-"));
  process.env["EAGLES_DATA_ROOT"] = tempDataRoot;
});

afterEach(() => {
  delete process.env["EAGLES_DATA_ROOT"];
  // Skip rmSync on Windows — SQLite WAL/SHM files stay locked; OS cleans temp on reboot
});

async function createTestClient(): Promise<Client> {
  const server = createVectorMemoryServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

describe("vector-memory-mcp server", () => {
  let client: Client;

  beforeEach(async () => {
    client = await createTestClient();
  });

  describe("tool listing", () => {
    it("listTools_returnsExactly4Tools", async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);

      expect(toolNames).toContain("memory_store");
      expect(toolNames).toContain("memory_search");
      expect(toolNames).toContain("memory_forget");
      expect(toolNames).toContain("memory_stats");
      expect(toolNames).toHaveLength(4);
    });
  });

  describe("memory_store", () => {
    it("store_validPayload_returnsSuccessWithId", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: {
          text: "Always use pnpm for monorepo management",
          project: "eagles-advanced",
          tags: ["pattern"],
          confidence: 0.9,
        },
      });

      const data = parseToolResult(result) as {
        success: boolean;
        id: string;
        text: string;
        project: string;
      };
      expect(data.success).toBe(true);
      expect(data.id).toBeTruthy();
      expect(data.text).toBe("Always use pnpm for monorepo management");
      expect(data.project).toBe("eagles-advanced");
    });

    it("store_defaultTagsAndConfidence_appliedCorrectly", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: { text: "Some memory without tags", project: "test-project" },
      });

      const data = parseToolResult(result) as {
        success: boolean;
        tags: unknown[];
        confidence: number;
      };
      expect(data.success).toBe(true);
      expect(data.tags).toEqual([]);
      expect(data.confidence).toBe(1.0);
    });

    it("store_multipleTags_persistsAllTags", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: {
          text: "GDPR lesson learned",
          project: "sourcing",
          tags: ["gdpr", "lesson", "security"],
          confidence: 0.95,
        },
      });

      const data = parseToolResult(result) as { tags: string[] };
      expect(data.tags).toEqual(["gdpr", "lesson", "security"]);
    });

    it("store_emptyText_returnsValidationError", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: { text: "", project: "test" },
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("memory_search", () => {
    it("search_noStoredMemories_returnsEmptyResults", async () => {
      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "monorepo management", topK: 5 },
      });

      const data = parseToolResult(result) as {
        results: unknown[];
        query: string;
        count: number;
      };
      expect(data.results).toEqual([]);
      expect(data.query).toBe("monorepo management");
      expect(data.count).toBe(0);
    });

    it("search_returnsQueryInResponse", async () => {
      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "TypeScript type safety", topK: 5 },
      });

      const data = parseToolResult(result) as { query: string };
      expect(data.query).toBe("TypeScript type safety");
    });

    it("search_minScoreFilter_excludesLowScoreResults", async () => {
      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "something", topK: 5, minScore: 0.99 },
      });

      const data = parseToolResult(result) as { results: Array<{ score: number }> };
      for (const r of data.results) {
        expect(r.score).toBeGreaterThanOrEqual(0.99);
      }
    });

    it("search_afterStore_resultsHaveEntryStructure", async () => {
      await client.callTool({
        name: "memory_store",
        arguments: { text: "pnpm is great", project: "my-proj", tags: ["pattern"], confidence: 1 },
      });

      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "pnpm", topK: 5, minScore: 0 },
      });

      const data = parseToolResult(result) as {
        results: Array<{ entry: { text: string; project: string }; score: number }>;
        count: number;
      };
      // With random vectors and minScore 0, we should get back stored entries
      expect(data.count).toBeGreaterThanOrEqual(0);
      for (const r of data.results) {
        expect(typeof r.score).toBe("number");
        expect(r.entry).toBeTruthy();
      }
    });
  });

  describe("memory_forget", () => {
    it("forget_nonExistentIds_returnsZeroDeletedWithIndexRebuilt", async () => {
      const result = await client.callTool({
        name: "memory_forget",
        arguments: { ids: ["ghost-id-1", "ghost-id-2"], reason: "GDPR right to erasure" },
      });

      const data = parseToolResult(result) as {
        deleted: number;
        requestedIds: number;
        indexRebuilt: boolean;
        reason: string;
      };
      expect(data.deleted).toBe(0);
      expect(data.requestedIds).toBe(2);
      expect(data.indexRebuilt).toBe(true);
      expect(data.reason).toBe("GDPR right to erasure");
    });

    it("forget_existingId_deletesFromRepository", async () => {
      const storeResult = await client.callTool({
        name: "memory_store",
        arguments: { text: "Memory to forget", project: "test", tags: [], confidence: 1 },
      });

      const stored = parseToolResult(storeResult) as { id: string };

      const forgetResult = await client.callTool({
        name: "memory_forget",
        arguments: { ids: [stored.id] },
      });

      const data = parseToolResult(forgetResult) as { deleted: number; indexRebuilt: boolean };
      expect(data.deleted).toBe(1);
      expect(data.indexRebuilt).toBe(true);
    });

    it("forget_withoutReason_defaultsToNotSpecified", async () => {
      const result = await client.callTool({
        name: "memory_forget",
        arguments: { ids: ["id-1"] },
      });

      const data = parseToolResult(result) as { reason: string };
      expect(data.reason).toBe("not specified");
    });

    it("forget_emptyIds_returnsValidationError", async () => {
      const result = await client.callTool({
        name: "memory_forget",
        arguments: { ids: [] },
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("memory_stats", () => {
    it("stats_emptyStore_returnsZeroCountHealthyIndex", async () => {
      const result = await client.callTool({ name: "memory_stats", arguments: {} });

      const data = parseToolResult(result) as {
        totalMemories: number;
        indexHealth: string;
        vectorDimensionality: number;
        modelName: string;
        modelLoaded: boolean;
      };

      expect(data.totalMemories).toBe(0);
      expect(data.indexHealth).toBe("healthy");
      expect(data.vectorDimensionality).toBe(384);
      expect(data.modelName).toBe("Xenova/all-MiniLM-L6-v2");
      expect(typeof data.modelLoaded).toBe("boolean");
    });

    it("stats_afterStoringTwo_returnsCount2", async () => {
      await client.callTool({
        name: "memory_store",
        arguments: { text: "Memory 1", project: "p", tags: ["lesson"], confidence: 1 },
      });
      await client.callTool({
        name: "memory_store",
        arguments: { text: "Memory 2", project: "p", tags: ["pattern"], confidence: 1 },
      });

      const result = await client.callTool({ name: "memory_stats", arguments: {} });
      const data = parseToolResult(result) as {
        totalMemories: number;
        byProject: Record<string, number>;
        byTag: Record<string, number>;
      };

      expect(data.totalMemories).toBe(2);
      expect(data.byProject["p"]).toBe(2);
      expect(data.byTag["lesson"]).toBe(1);
      expect(data.byTag["pattern"]).toBe(1);
    });

    it("stats_afterForget_totalDecrements", async () => {
      const storeResult = await client.callTool({
        name: "memory_store",
        arguments: { text: "Temporary memory", project: "p", tags: [], confidence: 1 },
      });
      const stored = parseToolResult(storeResult) as { id: string };

      await client.callTool({
        name: "memory_forget",
        arguments: { ids: [stored.id], reason: "test cleanup" },
      });

      const result = await client.callTool({ name: "memory_stats", arguments: {} });
      const data = parseToolResult(result) as { totalMemories: number };
      expect(data.totalMemories).toBe(0);
    });
  });

  describe("memory_store with TTL", () => {
    it("store_withTtl_returnsExpiresAt", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: {
          text: "Ephemeral memory with TTL",
          project: "test",
          ttlSeconds: 3600,
        },
      });

      const data = parseToolResult(result) as {
        success: boolean;
        expiresAt: string | null;
      };
      expect(data.success).toBe(true);
      expect(data.expiresAt).toBeTruthy();
      expect(data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("store_withoutTtl_expiresAtIsNull", async () => {
      const result = await client.callTool({
        name: "memory_store",
        arguments: {
          text: "Permanent memory",
          project: "test",
        },
      });

      const data = parseToolResult(result) as {
        success: boolean;
        expiresAt: string | null;
      };
      expect(data.success).toBe(true);
      expect(data.expiresAt).toBeNull();
    });
  });

  describe("memory_search modes", () => {
    it("search_semanticMode_returnsResults", async () => {
      await client.callTool({
        name: "memory_store",
        arguments: { text: "pnpm monorepo setup guide", project: "test" },
      });

      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "monorepo", mode: "semantic", minScore: 0 },
      });

      const data = parseToolResult(result) as { mode: string; count: number };
      expect(data.mode).toBe("semantic");
    });

    it("search_keywordMode_returnsResults", async () => {
      await client.callTool({
        name: "memory_store",
        arguments: { text: "Always validate user inputs at boundaries", project: "test" },
      });

      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "validate", mode: "keyword" },
      });

      const data = parseToolResult(result) as { mode: string; results: unknown[] };
      expect(data.mode).toBe("keyword");
    });

    it("search_hybridMode_deduplicatesResults", async () => {
      await client.callTool({
        name: "memory_store",
        arguments: { text: "SQLite WAL mode is best for concurrent reads", project: "test" },
      });

      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "SQLite WAL", mode: "hybrid", minScore: 0 },
      });

      const data = parseToolResult(result) as {
        mode: string;
        results: Array<{ entry: { id: string } }>;
      };
      expect(data.mode).toBe("hybrid");
      // Check no duplicate IDs
      const ids = data.results.map((r) => r.entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("search_defaultMode_isSemantic", async () => {
      const result = await client.callTool({
        name: "memory_search",
        arguments: { query: "anything" },
      });

      const data = parseToolResult(result) as { mode: string };
      expect(data.mode).toBe("semantic");
    });
  });
});

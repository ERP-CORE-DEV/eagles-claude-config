import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MEMORY_TAGS } from "@eagles-advanced/shared-utils";
import { VectorStore, MemoryRepository } from "@eagles-advanced/data-layer";
import { EmbeddingService } from "./services/EmbeddingService.js";
import { resolveDataPath } from "./config.js";

export function createVectorMemoryServer(): McpServer {
  const embeddingService = new EmbeddingService();
  const repository = new MemoryRepository(resolveDataPath("vector-memory/memories.sqlite"));
  const vectorStore = new VectorStore(resolveDataPath("vector-memory"));

  const server = new McpServer({ name: "vector-memory", version: "0.1.0" });

  server.tool(
    "memory_store",
    {
      text: z.string().min(1).max(2000),
      project: z.string().min(1),
      tags: z.array(z.enum(MEMORY_TAGS)).default([]),
      confidence: z.number().min(0).max(1).default(1.0),
      source: z.string().default("manual"),
    },
    async (params) => {
      const vector = await embeddingService.embed(params.text);
      const entry = repository.insert({
        text: params.text,
        project: params.project,
        tags: params.tags,
        confidence: params.confidence,
        source: params.source,
      });
      await vectorStore.upsert(entry.id, vector, { project: entry.project });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            id: entry.id,
            text: entry.text,
            project: entry.project,
            tags: entry.tags,
            confidence: entry.confidence,
            createdAt: entry.createdAt,
          }),
        }],
      };
    },
  );

  server.tool(
    "memory_search",
    {
      query: z.string().min(1).max(500),
      topK: z.number().int().min(1).max(50).default(5),
      project: z.string().optional(),
      tags: z.array(z.enum(MEMORY_TAGS)).optional(),
      minScore: z.number().min(0).max(1).default(0.3),
    },
    async (params) => {
      const queryVector = await embeddingService.embed(params.query);
      const rawResults = await vectorStore.search(queryVector, params.topK * 2);

      const filtered = rawResults.filter((r) => r.score >= params.minScore);

      const results = [];
      for (const hit of filtered) {
        const entry = repository.getById(hit.id);
        if (entry === null) continue;

        if (params.project !== undefined && entry.project !== params.project) continue;

        if (params.tags !== undefined && params.tags.length > 0) {
          const requiredTags = new Set(params.tags);
          const hasTag = entry.tags.some((tag) => requiredTags.has(tag));
          if (!hasTag) continue;
        }

        repository.updateAccess(entry.id);
        results.push({ entry, score: hit.score });

        if (results.length >= params.topK) break;
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ results, query: params.query, count: results.length }),
        }],
      };
    },
  );

  server.tool(
    "memory_forget",
    {
      ids: z.array(z.string()).min(1).max(100),
      reason: z.string().optional(),
    },
    async (params) => {
      // GDPR Article 17 — Right to Erasure: physical deletion from both stores
      const deletedFromDb = repository.delete(params.ids);

      for (const id of params.ids) {
        await vectorStore.delete(id);
      }

      // Rebuild index to physically purge deleted vectors (GDPR compliance)
      await vectorStore.rebuild();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            deleted: deletedFromDb,
            requestedIds: params.ids.length,
            indexRebuilt: true,
            reason: params.reason ?? "not specified",
          }),
        }],
      };
    },
  );

  server.tool(
    "memory_stats",
    {},
    async () => {
      const stats = repository.getStats();
      const healthy = await vectorStore.isHealthy();
      const vectorCount = vectorStore.getCount();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            totalMemories: stats.total,
            indexHealth: healthy ? "healthy" : "degraded",
            vectorDimensionality: 384,
            modelName: "Xenova/all-MiniLM-L6-v2",
            modelLoaded: embeddingService.isLoaded(),
            vectorCount,
            byProject: stats.byProject,
            byTag: stats.byTag,
          }),
        }],
      };
    },
  );

  return server;
}

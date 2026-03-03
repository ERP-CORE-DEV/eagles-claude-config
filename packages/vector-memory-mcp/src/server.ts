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
      ttlSeconds: z.number().int().positive().optional(),
    },
    async (params) => {
      const vector = await embeddingService.embed(params.text);
      const entry = repository.insert({
        text: params.text,
        project: params.project,
        tags: params.tags,
        confidence: params.confidence,
        source: params.source,
        ttlSeconds: params.ttlSeconds,
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
            expiresAt: entry.expiresAt,
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
      mode: z.enum(["semantic", "keyword", "hybrid"]).default("semantic"),
    },
    async (params) => {
      const results: Array<{ entry: NonNullable<ReturnType<typeof repository.getById>>; score: number }> = [];
      const seenIds = new Set<string>();

      const matchesFilters = (entry: NonNullable<ReturnType<typeof repository.getById>>): boolean => {
        if (params.project !== undefined && entry.project !== params.project) return false;
        if (params.tags !== undefined && params.tags.length > 0) {
          const requiredTags = new Set(params.tags);
          if (!entry.tags.some((tag) => requiredTags.has(tag))) return false;
        }
        if (entry.expiresAt !== null && entry.expiresAt <= new Date().toISOString()) return false;
        return true;
      };

      if (params.mode === "semantic" || params.mode === "hybrid") {
        const queryVector = await embeddingService.embed(params.query);
        const rawResults = await vectorStore.search(queryVector, params.topK * 2);

        for (const hit of rawResults) {
          if (hit.score < params.minScore) continue;
          const entry = repository.getById(hit.id);
          if (entry === null) continue;
          if (!matchesFilters(entry)) continue;
          if (seenIds.has(entry.id)) continue;
          seenIds.add(entry.id);
          results.push({ entry, score: hit.score });
        }
      }

      if (params.mode === "keyword" || params.mode === "hybrid") {
        const keywordResults = repository.searchByKeyword(params.query, {
          project: params.project,
          limit: params.topK * 2,
        });

        for (const entry of keywordResults) {
          if (seenIds.has(entry.id)) continue;
          if (!matchesFilters(entry)) continue;
          seenIds.add(entry.id);
          results.push({ entry, score: 0.5 });
        }
      }

      const topResults = results
        .sort((a, b) => b.score - a.score)
        .slice(0, params.topK);

      for (const r of topResults) {
        repository.updateAccess(r.entry.id);
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ results: topResults, query: params.query, count: topResults.length, mode: params.mode }),
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

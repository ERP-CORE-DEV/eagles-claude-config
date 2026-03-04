import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Mock EmbeddingService (avoids 90MB @xenova/transformers model) ----
function randomVector(dims = 384): number[] {
  return Array.from({ length: dims }, () => Math.random());
}

vi.mock("@eagles-ai-platform/vector-memory-mcp/server", async () => {
  // Re-implement a minimal server with mocked embedding + in-memory vector store.
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { z } = await import("zod");
  const { MemoryRepository } = await import("@eagles-ai-platform/data-layer");
  const nodePath = await import("node:path");
  const nodeFs = await import("node:fs");

  function resolveDataPath(relativePath: string): string {
    const dataRoot = process.env["EAGLES_DATA_ROOT"] ?? nodePath.join(process.cwd(), ".data");
    const fullPath = nodePath.join(dataRoot, relativePath);
    const dir = fullPath.includes(".") ? nodePath.join(fullPath, "..") : fullPath;
    nodeFs.mkdirSync(dir, { recursive: true });
    return fullPath;
  }

  return {
    createVectorMemoryServer: () => {
      const repository = new MemoryRepository(resolveDataPath("vector-memory/memories.sqlite"));
      const vectorMap = new Map<string, number[]>();
      const server = new McpServer({ name: "vector-memory", version: "0.1.0" });

      server.tool(
        "memory_store",
        {
          text: z.string().min(1).max(2000),
          project: z.string().min(1),
          tags: z.array(z.string()).default([]),
          confidence: z.number().min(0).max(1).default(1.0),
          source: z.string().default("manual"),
        },
        async (params) => {
          const entry = repository.insert({
            text: params.text,
            project: params.project,
            tags: params.tags as Array<"pattern" | "lesson" | "decision" | "observation" | "error-fix">,
            confidence: params.confidence,
            source: params.source,
          });
          vectorMap.set(entry.id, randomVector());
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
          tags: z.array(z.string()).optional(),
          minScore: z.number().min(0).max(1).default(0.3),
        },
        async (params) => {
          const results: Array<{ entry: unknown; score: number }> = [];
          for (const [id] of vectorMap) {
            const entry = repository.getById(id);
            if (!entry) continue;
            if (params.project && entry.project !== params.project) continue;
            const score = 0.85;
            if (score < params.minScore) continue;
            results.push({ entry, score });
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
          const deletedFromDb = repository.delete(params.ids);
          for (const id of params.ids) vectorMap.delete(id);
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

      server.tool("memory_stats", {}, async () => {
        const stats = repository.getStats();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              totalMemories: stats.total,
              indexHealth: "healthy",
              vectorDimensionality: 384,
              modelName: "Xenova/all-MiniLM-L6-v2",
              modelLoaded: false,
              vectorCount: vectorMap.size,
              byProject: stats.byProject,
              byTag: stats.byTag,
            }),
          }],
        };
      });

      return server;
    },
  };
});

// Import after mocks
import { BenchmarkOrchestrator } from "../src/runner/BenchmarkOrchestrator.js";

let outputRoot: string;

beforeEach(() => {
  outputRoot = mkdtempSync(join(tmpdir(), "bench-integration-"));
});

afterEach(() => {
  delete process.env["EAGLES_DATA_ROOT"];
});

describe("Benchmark Integration", () => {
  it("runAll_12Tasks_producesReportWithAdvancedWinning", async () => {
    const orchestrator = new BenchmarkOrchestrator(outputRoot);
    const results = await orchestrator.runAll();

    // Should have 12 task results
    expect(results.length).toBe(12);

    // Every result should have both classic and advanced
    for (const result of results) {
      expect(result.classic).toBeDefined();
      expect(result.advanced).toBeDefined();
      expect(result.classic.metrics.system).toBe("classic");
      expect(result.advanced.metrics.system).toBe("advanced");
    }

    // Advanced should succeed on all 12 tasks
    const advancedSuccesses = results.filter((r) => r.advanced.metrics.success).length;
    expect(advancedSuccesses).toBe(12);

    // Classic should NOT support drift detection (3 drift tasks should fail)
    const classicDriftResults = results.filter((r) =>
      r.taskId.startsWith("drift-"),
    );
    for (const dr of classicDriftResults) {
      expect(dr.classic.featureSupported).toBe(false);
    }

    // Reports should be written
    const reportPath = join(outputRoot, "benchmark-results", "BENCHMARK_REPORT.md");
    const jsonPath = join(outputRoot, "benchmark-results", "benchmark-data.json");

    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    // Report should contain key sections
    const reportContent = readFileSync(reportPath, "utf-8");
    expect(reportContent).toContain("# EAGLES Benchmark Report");
    expect(reportContent).toContain("Feature Gap Analysis");
    expect(reportContent).toContain("Per-Dimension Results");
    expect(reportContent).toContain("Verdict");
    expect(reportContent).toContain("Advanced wins");

    // JSON should be valid
    const jsonContent = readFileSync(jsonPath, "utf-8");
    const parsed = JSON.parse(jsonContent);
    expect(parsed.metadata.taskCount).toBe(12);
    expect(parsed.rawRuns.classic.length).toBe(12);
    expect(parsed.rawRuns.advanced.length).toBe(12);
  }, 30000);

  it("runAll_driftTrajectory_showsProgressWithRecommendations", async () => {
    const orchestrator = new BenchmarkOrchestrator(outputRoot);
    const results = await orchestrator.runAll();

    const threeWave = results.find((r) => r.taskId === "drift-three-wave-trajectory");
    expect(threeWave).toBeDefined();
    expect(threeWave!.advanced.metrics.success).toBe(true);

    const detail = threeWave!.advanced.detail as { toolResults: Array<Record<string, unknown>> };
    expect(detail.toolResults.length).toBeGreaterThanOrEqual(8);

    // Find drift_compare results (3 waves)
    const driftCompares = detail.toolResults.filter(
      (r: Record<string, unknown>) => typeof r === "object" && r !== null && "driftScore" in r && "waveNumber" in r,
    ) as Array<{ driftScore: number; waveNumber: number }>;
    expect(driftCompares.length).toBe(3);

    // All scores should be between 0 and 1
    for (const compare of driftCompares) {
      expect(compare.driftScore).toBeGreaterThanOrEqual(0);
      expect(compare.driftScore).toBeLessThanOrEqual(1);
    }

    // Cumulative coverage improves: Wave 3 score > Wave 1 (more reqs addressed)
    expect(driftCompares[2].driftScore).toBeGreaterThan(driftCompares[0].driftScore);

    // Final report should have correct structure
    const report = detail.toolResults.find(
      (r: Record<string, unknown>) => typeof r === "object" && r !== null && "totalWaves" in r && "overallHealth" in r,
    ) as { recommendations: string[]; totalWaves: number; overallHealth: string; trend: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.totalWaves).toBe(3);
    expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(report!.overallHealth);
    expect(["STABLE", "IMPROVING", "DEGRADING"]).toContain(report!.trend);
  }, 30000);

  it("runAll_budgetThresholds_detectsEscalation", async () => {
    const orchestrator = new BenchmarkOrchestrator(outputRoot);
    const results = await orchestrator.runAll();

    const budget = results.find((r) => r.taskId === "budget-threshold-detection");
    expect(budget).toBeDefined();
    expect(budget!.advanced.metrics.success).toBe(true);

    const detail = budget!.advanced.detail as { toolResults: Array<Record<string, unknown>> };
    // Should have budget status responses showing escalation
    const statusResults = detail.toolResults.filter(
      (r: Record<string, unknown>) => typeof r === "object" && r !== null && "status" in r,
    ) as Array<{ status: string; totalCostUsd: number }>;

    expect(statusResults.length).toBeGreaterThanOrEqual(2);
    // Budget should be at warn or higher after first spend
    expect(["warn", "critical", "halt"]).toContain(statusResults[0].status);
  }, 30000);
});

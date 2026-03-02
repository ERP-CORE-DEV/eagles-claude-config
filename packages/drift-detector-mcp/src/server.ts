import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// TODO: Phase 4 — Wire DriftStore, scoring algorithms, TokenAwareness

export function createDriftDetectorServer(): McpServer {
  const server = new McpServer({ name: "drift-detector", version: "0.1.0" });

  server.tool(
    "drift_set_requirements",
    {
      sessionId: z.string(),
      title: z.string(),
      requirementsText: z.string().min(10),
      plannedFiles: z.array(z.string()).default([]),
      initialTestCount: z.number().int().nonnegative().optional(),
      tokenBudget: z.number().int().positive().optional(),
    },
    async (params) => {
      // TODO: Phase 4 — Parse requirements, persist, return checklist preview
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            checklistItemsParsed: 0,
            createdAt: new Date().toISOString(),
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_checkpoint",
    {
      sessionId: z.string(),
      waveNumber: z.number().int().nonnegative(),
      filesModified: z.array(z.string()),
      testsTotal: z.number().int().nonnegative(),
      testsPassing: z.number().int().nonnegative(),
      requirementsAddressed: z.array(z.string()),
      tokensConsumed: z.number().int().nonnegative().optional(),
      linesAdded: z.number().int().nonnegative().optional(),
      newFilesCreated: z.array(z.string()).default([]),
    },
    async (params) => {
      // TODO: Phase 4 — Persist checkpoint, compute cumulative files
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            waveNumber: params.waveNumber,
            snapshotAt: new Date().toISOString(),
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_compare",
    {
      sessionId: z.string(),
      waveNumber: z.number().int().nonnegative(),
    },
    async (params) => {
      // TODO: Phase 4 — Run 5 scoring algorithms, compute composite score
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            waveNumber: params.waveNumber,
            driftScore: 1.0,
            verdict: "SYNCED",
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_alert",
    {
      sessionId: z.string(),
      waveNumber: z.number().int().nonnegative(),
    },
    async (params) => {
      // TODO: Phase 4 — Check thresholds, return alert level
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            waveNumber: params.waveNumber,
            alertLevel: "NONE",
            driftScore: 1.0,
            recommendedAction: "continue",
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_report",
    {
      sessionId: z.string(),
      includeRecommendations: z.boolean().default(true),
    },
    async (params) => {
      // TODO: Phase 4 — Generate human-readable drift analysis
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            totalWaves: 0,
            overallHealth: "HEALTHY",
            trend: "STABLE",
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_history",
    {
      sessionId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (params) => {
      // TODO: Phase 4 — Return time-series of drift scores
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            scores: [],
            totalWavesRecorded: 0,
          }),
        }],
      };
    },
  );

  server.tool(
    "drift_reset",
    {
      sessionId: z.string(),
      confirm: z.boolean(),
    },
    async (params) => {
      if (!params.confirm) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: "confirm must be true to reset" }),
          }],
        };
      }
      // TODO: Phase 4 — Clear all drift state for session
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            deleted: { requirements: 0, checkpoints: 0, driftScores: 0, alerts: 0 },
            resetAt: new Date().toISOString(),
          }),
        }],
      };
    },
  );

  return server;
}

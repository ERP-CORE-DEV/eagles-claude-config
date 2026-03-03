import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DriftStore } from "@eagles-advanced/data-layer";
import { parseRequirements } from "./parsing/RequirementsParser.js";
import {
  scoreRequirementCoverage,
  scoreTestHealth,
  scoreFileChurn,
  scoreTokenEfficiency,
  scoreScopeCreep,
} from "./scoring/ScoringAlgorithms.js";
import { computeCompositeScore, computeTrendWithDecay } from "./scoring/CompositeScorer.js";
import type { OverallHealth, DriftTrend } from "@eagles-advanced/shared-utils";

const DEFAULT_DB_PATH = join(tmpdir(), "eagles-drift.sqlite");

export function createDriftDetectorServer(dbPath?: string): McpServer {
  const store = new DriftStore(dbPath ?? DEFAULT_DB_PATH);
  const server = new McpServer({ name: "drift-detector", version: "0.1.0" });

  // -------------------------------------------------------------------------
  // drift_set_requirements
  // -------------------------------------------------------------------------
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
      const checklist = parseRequirements(params.requirementsText);
      const checklistTexts = checklist.map((item) => item.text);

      const row = store.insertRequirements({
        sessionId: params.sessionId,
        title: params.title,
        requirementsText: params.requirementsText,
        checklistItems: checklistTexts,
        plannedFiles: params.plannedFiles,
        initialTestCount: params.initialTestCount,
        tokenBudget: params.tokenBudget,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: row.sessionId,
            title: row.title,
            checklistItemsParsed: checklistTexts.length,
            plannedFiles: row.plannedFiles.length,
            initialTestCount: row.initialTestCount,
            tokenBudget: row.tokenBudget,
            createdAt: row.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_checkpoint
  // -------------------------------------------------------------------------
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
      // Build cumulative files from all prior checkpoints plus this one
      const prior = store.getCheckpoints(params.sessionId);
      const priorCumulative =
        prior.length > 0 ? prior[prior.length - 1].cumulativeFiles : [];
      const cumulativeSet = new Set([
        ...priorCumulative,
        ...params.filesModified,
        ...params.newFilesCreated,
      ]);

      const row = store.insertCheckpoint({
        sessionId: params.sessionId,
        waveNumber: params.waveNumber,
        filesModified: params.filesModified,
        testsTotal: params.testsTotal,
        testsPassing: params.testsPassing,
        requirementsAddressed: params.requirementsAddressed,
        tokensConsumed: params.tokensConsumed,
        linesAdded: params.linesAdded,
        newFilesCreated: params.newFilesCreated,
        cumulativeFiles: Array.from(cumulativeSet),
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: row.sessionId,
            waveNumber: row.waveNumber,
            cumulativeFilesTracked: row.cumulativeFiles.length,
            snapshotAt: row.snapshotAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_compare
  // -------------------------------------------------------------------------
  server.tool(
    "drift_compare",
    {
      sessionId: z.string(),
      waveNumber: z.number().int().nonnegative(),
    },
    async (params) => {
      const requirements = store.getRequirements(params.sessionId);
      const checkpoints = store.getCheckpoints(params.sessionId);

      const checkpoint = checkpoints.find(
        (cp) => cp.waveNumber === params.waveNumber,
      );

      if (checkpoint === undefined || requirements === null) {
        // No data yet — return perfect score as a safe default
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              sessionId: params.sessionId,
              waveNumber: params.waveNumber,
              driftScore: 1.0,
              verdict: "SYNCED",
              metrics: {
                requirementCoverage: 1.0,
                testHealth: 1.0,
                fileChurn: 1.0,
                tokenEfficiency: null,
                scopeCreep: 1.0,
              },
              warning: "No requirements or checkpoint found for this session/wave.",
            }),
          }],
        };
      }

      // Aggregate requirements addressed across all checkpoints up to this wave
      const relevantCheckpoints = checkpoints.filter(
        (cp) => cp.waveNumber <= params.waveNumber,
      );
      const allAddressed = Array.from(
        new Set(relevantCheckpoints.flatMap((cp) => cp.requirementsAddressed)),
      );

      // Aggregate cumulative files and edits
      const totalEdits = relevantCheckpoints.reduce(
        (sum, cp) => sum + cp.filesModified.length,
        0,
      );
      const uniqueFilesSet = new Set(
        relevantCheckpoints.flatMap((cp) => cp.filesModified),
      );

      // Aggregate new files and tokens
      const allNewFiles = Array.from(
        new Set(relevantCheckpoints.flatMap((cp) => cp.newFilesCreated)),
      );
      const totalTokens = relevantCheckpoints.reduce(
        (sum, cp) => sum + (cp.tokensConsumed ?? 0),
        0,
      );
      const totalLines = relevantCheckpoints.reduce(
        (sum, cp) => sum + (cp.linesAdded ?? 0),
        0,
      );
      const hasTokenData = relevantCheckpoints.some(
        (cp) => cp.tokensConsumed !== null && cp.tokensConsumed > 0,
      );

      const requirementCoverage = scoreRequirementCoverage(
        requirements.checklistItems.length,
        allAddressed,
        requirements.checklistItems,
      );
      const testHealth = scoreTestHealth(
        checkpoint.testsPassing,
        checkpoint.testsTotal,
        requirements.initialTestCount ?? 0,
      );
      const fileChurn = scoreFileChurn(uniqueFilesSet.size, totalEdits);
      const tokenEfficiency = hasTokenData
        ? scoreTokenEfficiency(totalLines, totalTokens)
        : null;
      const scopeCreep = scoreScopeCreep(allNewFiles, requirements.plannedFiles);

      const { driftScore, verdict } = computeCompositeScore({
        requirementCoverage,
        testHealth,
        fileChurn,
        tokenEfficiency,
        scopeCreep,
      });

      store.insertDriftScore({
        sessionId: params.sessionId,
        waveNumber: params.waveNumber,
        driftScore,
        requirementCoverage,
        testHealth,
        fileChurn,
        tokenEfficiency,
        scopeCreep,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            waveNumber: params.waveNumber,
            driftScore,
            verdict,
            metrics: {
              requirementCoverage,
              testHealth,
              fileChurn,
              tokenEfficiency,
              scopeCreep,
            },
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_alert
  // -------------------------------------------------------------------------
  server.tool(
    "drift_alert",
    {
      sessionId: z.string(),
      waveNumber: z.number().int().nonnegative(),
    },
    async (params) => {
      const requirements = store.getRequirements(params.sessionId);
      const scores = store.getScoresForSession(params.sessionId);
      const waveScore = scores.find((s) => s.waveNumber === params.waveNumber);

      const thresholdWarning = requirements?.thresholdWarning ?? 0.6;
      const thresholdBlock = requirements?.thresholdBlock ?? 0.4;

      const driftScore = waveScore?.driftScore ?? 1.0;

      let alertLevel: "NONE" | "WARNING" | "BLOCK";
      let message: string;
      let recommendedAction: string;

      if (driftScore >= thresholdWarning) {
        alertLevel = "NONE";
        message = `Session is on track. Drift score: ${driftScore.toFixed(3)}`;
        recommendedAction = "continue";
      } else if (driftScore >= thresholdBlock) {
        alertLevel = "WARNING";
        message = `Drift detected. Score ${driftScore.toFixed(3)} is below warning threshold ${thresholdWarning}.`;
        recommendedAction = "review_requirements_and_replan";
      } else {
        alertLevel = "BLOCK";
        message = `Critical drift. Score ${driftScore.toFixed(3)} is below block threshold ${thresholdBlock}.`;
        recommendedAction = "halt_and_realign";
      }

      if (alertLevel !== "NONE") {
        store.insertAlert({
          sessionId: params.sessionId,
          waveNumber: params.waveNumber,
          alertLevel,
          driftScore,
          message,
          recommendedAction,
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            waveNumber: params.waveNumber,
            alertLevel,
            driftScore,
            message,
            recommendedAction,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_report
  // -------------------------------------------------------------------------
  server.tool(
    "drift_report",
    {
      sessionId: z.string(),
      includeRecommendations: z.boolean().default(true),
    },
    async (params) => {
      const requirements = store.getRequirements(params.sessionId);
      const scores = store.getScoresForSession(params.sessionId);
      const alerts = store.getAlertsForSession(params.sessionId);

      const totalWaves = scores.length;

      let overallHealth: OverallHealth = "HEALTHY";
      let trend: DriftTrend = "STABLE";

      if (totalWaves > 0) {
        const latestScore = scores[scores.length - 1].driftScore;
        const thresholdWarning = requirements?.thresholdWarning ?? 0.6;
        const thresholdBlock = requirements?.thresholdBlock ?? 0.4;

        if (latestScore < thresholdBlock) {
          overallHealth = "CRITICAL";
        } else if (latestScore < thresholdWarning) {
          overallHealth = "WARNING";
        } else {
          overallHealth = "HEALTHY";
        }

        if (totalWaves >= 2) {
          const previous = scores[scores.length - 2].driftScore;
          const delta = latestScore - previous;
          if (delta > 0.05) {
            trend = "IMPROVING";
          } else if (delta < -0.05) {
            trend = "DEGRADING";
          } else {
            trend = "STABLE";
          }
        }
      }

      const recommendations: string[] = [];
      if (params.includeRecommendations && totalWaves > 0) {
        const latest = scores[scores.length - 1];
        if (latest.metrics.requirementCoverage < 0.7) {
          recommendations.push(
            "Requirement coverage is low — address more checklist items in upcoming waves.",
          );
        }
        if (latest.metrics.testHealth < 0.7) {
          recommendations.push(
            "Test health is low — fix failing tests before proceeding.",
          );
        }
        if (latest.metrics.scopeCreep < 0.8) {
          recommendations.push(
            "Scope creep detected — review unplanned files with stakeholders.",
          );
        }
        if (latest.metrics.fileChurn < 0.5) {
          recommendations.push(
            "High file churn on few files — consider refactoring hotspots.",
          );
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            title: requirements?.title ?? null,
            totalWaves,
            overallHealth,
            trend,
            latestScore: totalWaves > 0 ? scores[scores.length - 1].driftScore : null,
            alertCount: alerts.length,
            scores: scores.map((s) => ({
              waveNumber: s.waveNumber,
              driftScore: s.driftScore,
              verdict: s.alertLevel === "NONE" ? "SYNCED"
                : s.alertLevel === "WARNING" ? "WARNING"
                : "DRIFTING",
            })),
            recommendations: params.includeRecommendations ? recommendations : [],
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_history
  // -------------------------------------------------------------------------
  server.tool(
    "drift_history",
    {
      sessionId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (params) => {
      const allScores = store.getScoresForSession(params.sessionId);
      const limited = params.limit !== undefined
        ? allScores.slice(-params.limit)
        : allScores;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            scores: limited.map((s) => ({
              waveNumber: s.waveNumber,
              driftScore: s.driftScore,
              alertLevel: s.alertLevel,
              metrics: s.metrics,
              computedAt: s.computedAt,
            })),
            totalWavesRecorded: allScores.length,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_trend
  // -------------------------------------------------------------------------
  server.tool(
    "drift_trend",
    {
      sessionId: z.string(),
      halfLifeHours: z.number().positive().default(24),
    },
    async (params) => {
      const scores = store.getScoresForSession(params.sessionId);

      const timestampedScores = scores.map((s) => ({
        score: s.driftScore,
        computedAt: s.computedAt,
      }));

      const result = computeTrendWithDecay(
        timestampedScores,
        params.halfLifeHours,
      );

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            wavesAnalyzed: scores.length,
            ...result,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // drift_reset
  // -------------------------------------------------------------------------
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

      const deleted = store.deleteSession(params.sessionId);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            deleted,
            resetAt: new Date().toISOString(),
          }),
        }],
      };
    },
  );

  return server;
}

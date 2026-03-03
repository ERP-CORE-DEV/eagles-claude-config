import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VerificationStore } from "./store/VerificationStore.js";
import { CheckpointManager } from "./checkpoints/checkpoint-manager.js";
import { scoreAgent } from "./scoring/agent-scorer.js";
import { assessTruth } from "./scoring/truth-scorer.js";

const DEFAULT_DB_PATH = join(tmpdir(), "eagles-verification.sqlite");

const scoreObservationSchema = z.object({
  dimension: z.enum(["accuracy", "reliability", "consistency", "efficiency", "adaptability"]),
  value: z.number().min(0).max(1),
  timestamp: z.string(),
});

export function createVerificationServer(dbPath?: string): McpServer {
  const store = new VerificationStore(dbPath ?? DEFAULT_DB_PATH);
  const checkpointManager = new CheckpointManager(store);
  const server = new McpServer({ name: "verification-mcp", version: "0.1.0" });

  // -------------------------------------------------------------------------
  // verify_output
  // -------------------------------------------------------------------------
  server.tool(
    "verify_output",
    {
      output: z.string(),
      expectedFormat: z.string().optional(),
      sourceContext: z.string().optional(),
      sessionId: z.string(),
    },
    async (params) => {
      const assessment = assessTruth({
        output: params.output,
        expectedFormat: params.expectedFormat,
        sourceContext: params.sourceContext,
      });

      store.insertVerificationRecord(params.sessionId, assessment);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            confidence: assessment.confidence,
            flags: assessment.flags,
            suggestedAction: assessment.suggestedAction,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_score_agent
  // -------------------------------------------------------------------------
  server.tool(
    "verify_score_agent",
    {
      sessionId: z.string(),
      agentId: z.string(),
      observations: z.array(scoreObservationSchema),
      halfLifeHours: z.number().positive().optional(),
    },
    async (params) => {
      const agentScore = scoreAgent(params.observations, params.halfLifeHours ?? 24);

      store.insertAgentScore(params.sessionId, params.agentId, agentScore);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            agentId: params.agentId,
            accuracy: agentScore.accuracy,
            reliability: agentScore.reliability,
            consistency: agentScore.consistency,
            efficiency: agentScore.efficiency,
            adaptability: agentScore.adaptability,
            composite: agentScore.composite,
            riskLevel: agentScore.riskLevel,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_checkpoint_create
  // -------------------------------------------------------------------------
  server.tool(
    "verify_checkpoint_create",
    {
      sessionId: z.string(),
      name: z.string(),
      stateJson: z.string(),
      agentScore: z.number().min(0).max(1).optional(),
    },
    async (params) => {
      const checkpoint = checkpointManager.create({
        sessionId: params.sessionId,
        name: params.name,
        stateJson: params.stateJson,
        agentScore: params.agentScore,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            checkpointId: checkpoint.checkpointId,
            sessionId: checkpoint.sessionId,
            name: checkpoint.name,
            agentScore: checkpoint.agentScore,
            verified: checkpoint.verified,
            createdAt: checkpoint.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_checkpoint_list
  // -------------------------------------------------------------------------
  server.tool(
    "verify_checkpoint_list",
    {
      sessionId: z.string(),
    },
    async (params) => {
      const checkpoints = checkpointManager.listForSession(params.sessionId);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            checkpoints: checkpoints.map((cp) => ({
              checkpointId: cp.checkpointId,
              name: cp.name,
              agentScore: cp.agentScore,
              verified: cp.verified,
              createdAt: cp.createdAt,
            })),
            total: checkpoints.length,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_checkpoint_restore
  // -------------------------------------------------------------------------
  server.tool(
    "verify_checkpoint_restore",
    {
      checkpointId: z.string(),
    },
    async (params) => {
      const checkpoint = checkpointManager.restore(params.checkpointId);

      if (checkpoint === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `Checkpoint not found: ${params.checkpointId}`,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            checkpointId: checkpoint.checkpointId,
            sessionId: checkpoint.sessionId,
            name: checkpoint.name,
            stateJson: checkpoint.stateJson,
            agentScore: checkpoint.agentScore,
            verified: checkpoint.verified,
            createdAt: checkpoint.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_rollback
  // -------------------------------------------------------------------------
  server.tool(
    "verify_rollback",
    {
      sessionId: z.string(),
    },
    async (params) => {
      const checkpoint = checkpointManager.getLastGood(params.sessionId);

      if (checkpoint === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `No verified checkpoint found for session: ${params.sessionId}`,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            checkpointId: checkpoint.checkpointId,
            sessionId: checkpoint.sessionId,
            name: checkpoint.name,
            stateJson: checkpoint.stateJson,
            agentScore: checkpoint.agentScore,
            verified: checkpoint.verified,
            createdAt: checkpoint.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_pipeline_run
  // -------------------------------------------------------------------------
  server.tool(
    "verify_pipeline_run",
    {
      sessionId: z.string(),
      agentId: z.string(),
      output: z.string(),
      observations: z.array(scoreObservationSchema),
    },
    async (params) => {
      const assessment = assessTruth({ output: params.output });
      store.insertVerificationRecord(params.sessionId, assessment);

      const agentScore = scoreAgent(params.observations);
      store.insertAgentScore(params.sessionId, params.agentId, agentScore);

      let autoCheckpoint = null;
      if (assessment.suggestedAction === "accept" && agentScore.composite >= 0.7) {
        autoCheckpoint = checkpointManager.create({
          sessionId: params.sessionId,
          name: `auto-${new Date().toISOString()}`,
          stateJson: JSON.stringify({ output: params.output, agentId: params.agentId }),
          agentScore: agentScore.composite,
        });
        checkpointManager.verify(autoCheckpoint.checkpointId);
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            agentId: params.agentId,
            assessment: {
              confidence: assessment.confidence,
              flags: assessment.flags,
              suggestedAction: assessment.suggestedAction,
            },
            agentScore: {
              composite: agentScore.composite,
              riskLevel: agentScore.riskLevel,
            },
            autoCheckpointCreated: autoCheckpoint !== null,
            checkpointId: autoCheckpoint?.checkpointId ?? null,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // verify_history
  // -------------------------------------------------------------------------
  server.tool(
    "verify_history",
    {
      sessionId: z.string(),
    },
    async (params) => {
      const history = store.getVerificationHistory(params.sessionId);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            sessionId: params.sessionId,
            records: history.map((r) => ({
              id: r.id,
              confidence: r.confidence,
              suggestedAction: r.suggestedAction,
              flags: r.flags,
              verifiedAt: r.verifiedAt,
            })),
            total: history.length,
          }),
        }],
      };
    },
  );

  return server;
}

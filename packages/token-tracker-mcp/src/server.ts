import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TokenLedger, EventBus } from "@eagles-advanced/data-layer";
import { BUDGET_THRESHOLDS } from "@eagles-advanced/shared-utils";
import { resolveDataPath } from "./config.js";

export function createTokenTrackerServer(): McpServer {
  const ledger = new TokenLedger(resolveDataPath("token-ledger/ledger.sqlite"));
  const bus = new EventBus(resolveDataPath("event-bus/bus.sqlite"));
  const server = new McpServer({ name: "token-tracker", version: "0.1.0" });

  server.tool(
    "record_token_usage",
    {
      sessionId: z.string(),
      modelName: z.string(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      cacheReadTokens: z.number().int().nonnegative().default(0),
      cacheWriteTokens: z.number().int().nonnegative().default(0),
      waveNumber: z.number().int().optional(),
      agentName: z.string().optional(),
      toolName: z.string().optional(),
    },
    async (params) => {
      const record = ledger.insert({
        sessionId: params.sessionId,
        modelName: params.modelName,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        cacheReadTokens: params.cacheReadTokens,
        cacheWriteTokens: params.cacheWriteTokens,
        waveNumber: params.waveNumber ?? null,
        agentName: params.agentName ?? null,
        toolName: params.toolName ?? null,
      });
      bus.publish("token.recorded", record);
      return { content: [{ type: "text" as const, text: JSON.stringify(record) }] };
    },
  );

  server.tool(
    "get_budget_status",
    { windowDays: z.number().int().positive().default(30) },
    async ({ windowDays }) => {
      const total = ledger.sumCost(windowDays);
      const status =
        total >= BUDGET_THRESHOLDS.HALT_USD ? "halt"
        : total >= BUDGET_THRESHOLDS.CRITICAL_USD ? "critical"
        : total >= BUDGET_THRESHOLDS.WARN_USD ? "warn"
        : "ok";

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ totalCostUsd: total, status, thresholds: BUDGET_THRESHOLDS }),
        }],
      };
    },
  );

  server.tool(
    "route_by_budget",
    { requiredCapabilityLevel: z.enum(["basic", "standard", "advanced"]) },
    async ({ requiredCapabilityLevel }) => {
      const currentSpend = ledger.sumCost(30);
      const recommendation =
        currentSpend >= BUDGET_THRESHOLDS.CRITICAL_USD && requiredCapabilityLevel === "basic"
          ? "deepseek-v3"
          : currentSpend >= BUDGET_THRESHOLDS.WARN_USD && requiredCapabilityLevel !== "advanced"
            ? "codestral-2501"
            : "kimi-k2-thinking";

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ recommended: recommendation, currentSpendUsd: currentSpend }),
        }],
      };
    },
  );

  return server;
}

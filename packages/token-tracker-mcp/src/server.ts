import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TokenLedger, EventBus, ToolMetricsStore } from "@eagles-advanced/data-layer";
import { BUDGET_THRESHOLDS, MODEL_PRICING } from "@eagles-advanced/shared-utils";
import { resolveDataPath } from "./config.js";

export function createTokenTrackerServer(): McpServer {
  const ledger = new TokenLedger(resolveDataPath("token-ledger/ledger.sqlite"));
  const bus = new EventBus(resolveDataPath("event-bus/bus.sqlite"));
  const toolMetrics = new ToolMetricsStore(resolveDataPath("tool-metrics/metrics.sqlite"));
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

  server.tool(
    "get_session_cost",
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const data = ledger.getSessionCost(sessionId);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "get_agent_costs",
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const data = ledger.getAgentCosts(sessionId);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "get_wave_costs",
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const data = ledger.getWaveCosts(sessionId);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "get_cost_report",
    { windowDays: z.number().int().positive().default(30) },
    async ({ windowDays }) => {
      const data = ledger.getCostReport(windowDays);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "get_model_pricing",
    {},
    async () => {
      return { content: [{ type: "text" as const, text: JSON.stringify(MODEL_PRICING) }] };
    },
  );

  server.tool(
    "get_cost_advisory",
    { windowDays: z.number().int().positive().default(30) },
    async ({ windowDays }) => {
      const advisories = ledger.generateAdvisory(windowDays);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ advisories, count: advisories.length }),
        }],
      };
    },
  );

  server.tool(
    "record_tool_metric",
    {
      toolName: z.string(),
      durationMs: z.number().nonnegative(),
      success: z.boolean().default(true),
      serverName: z.string().default("unknown"),
    },
    async (params) => {
      const record = toolMetrics.record({
        toolName: params.toolName,
        durationMs: params.durationMs,
        success: params.success,
        serverName: params.serverName,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(record) }] };
    },
  );

  server.tool(
    "get_tool_metrics",
    {
      toolName: z.string().optional(),
      windowDays: z.number().int().positive().optional(),
      topSlowest: z.number().int().min(1).max(50).default(10),
    },
    async (params) => {
      if (params.toolName !== undefined) {
        const percentiles = toolMetrics.getPercentiles(params.toolName, params.windowDays);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(percentiles ?? { error: "No metrics found for this tool" }),
          }],
        };
      }

      const slowest = toolMetrics.getTopSlowest(params.topSlowest, params.windowDays);
      const allTools = toolMetrics.getAllToolNames();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            totalTools: allTools.length,
            totalRecords: toolMetrics.count(),
            topSlowest: slowest,
          }),
        }],
      };
    },
  );

  return server;
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProviderRegistry } from "./providers/registry.js";
import { ProviderStore } from "./store/ProviderStore.js";
import { routeByCost, routeByRoundRobin, routeByLatency } from "./routing/strategies.js";
import { classifyError, selectFailoverProvider } from "./routing/failover.js";
import { resolveDataPath } from "./config.js";
import type { IProvider, ModelCapability, RoutingRequest } from "./providers/types.js";

// ---------------------------------------------------------------------------
// Default provider implementations
// ---------------------------------------------------------------------------

class DefaultProvider implements IProvider {
  readonly name: string;
  readonly models: readonly ModelCapability[];
  private _available: boolean;

  constructor(
    name: string,
    models: readonly ModelCapability[],
    available = true,
  ) {
    this.name = name;
    this.models = models;
    this._available = available;
  }

  isAvailable(): boolean {
    return this._available;
  }

  setAvailable(value: boolean): void {
    this._available = value;
  }

  estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
    const model = this.models.find((m) => m.modelId === modelId) ?? this.models[0];
    if (model === undefined) {
      return 0;
    }
    const inputCost = (inputTokens / 1000) * model.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * model.outputCostPer1kTokens;
    return inputCost + outputCost;
  }
}

function buildDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(new DefaultProvider("anthropic", [
    {
      modelId: "claude-3-haiku-20240307",
      maxTokens: 200000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.00025,
      outputCostPer1kTokens: 0.00125,
    },
    {
      modelId: "claude-sonnet-4-6",
      maxTokens: 200000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.003,
      outputCostPer1kTokens: 0.015,
    },
    {
      modelId: "claude-opus-4-6",
      maxTokens: 200000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.015,
      outputCostPer1kTokens: 0.075,
    },
  ]));

  registry.register(new DefaultProvider("openai", [
    {
      modelId: "gpt-4o-mini",
      maxTokens: 128000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.00015,
      outputCostPer1kTokens: 0.0006,
    },
    {
      modelId: "gpt-4o",
      maxTokens: 128000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.005,
      outputCostPer1kTokens: 0.015,
    },
  ]));

  registry.register(new DefaultProvider("google", [
    {
      modelId: "gemini-1.5-flash",
      maxTokens: 1000000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.000075,
      outputCostPer1kTokens: 0.0003,
    },
    {
      modelId: "gemini-1.5-pro",
      maxTokens: 2000000,
      supportsStreaming: true,
      inputCostPer1kTokens: 0.00125,
      outputCostPer1kTokens: 0.005,
    },
  ]));

  return registry;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

export function createProviderRouterServer(): McpServer {
  const registry = buildDefaultRegistry();
  const store = new ProviderStore(resolveDataPath("provider-router/router.sqlite"));
  const latencyMap = new Map<string, number>();
  let roundRobinCounter = 0;

  const server = new McpServer({ name: "provider-router", version: "0.1.0" });

  server.tool(
    "provider_route",
    {
      capabilityLevel: z.enum(["basic", "standard", "advanced"]),
      maxCostUsd: z.number().positive().optional(),
      preferredProvider: z.string().optional(),
      strategy: z.enum(["cost-based", "round-robin", "latency-based", "least-loaded"]).default("cost-based"),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    },
    async (params) => {
      const request: RoutingRequest = {
        capabilityLevel: params.capabilityLevel,
        maxCostUsd: params.maxCostUsd,
        preferredProvider: params.preferredProvider,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
      };

      const providers = registry.list();
      let result = null;

      if (params.strategy === "round-robin") {
        result = routeByRoundRobin(providers, request, roundRobinCounter++);
      } else if (params.strategy === "latency-based") {
        result = routeByLatency(providers, request, latencyMap);
      } else {
        result = routeByCost(providers, request);
      }

      if (result === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: "No suitable provider found matching the given constraints" }),
          }],
        };
      }

      store.recordRouting({
        provider: result.selectedProvider,
        model: result.selectedModel,
        strategy: result.strategy,
        costUsd: result.estimatedCostUsd,
        durationMs: 0,
        success: true,
      });

      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "provider_list",
    {},
    async () => {
      const providers = registry.list().map((p) => ({
        name: p.name,
        available: p.isAvailable(),
        models: p.models,
        latencyMs: latencyMap.get(p.name) ?? null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify({ providers }) }] };
    },
  );

  server.tool(
    "provider_register",
    {
      name: z.string().min(1),
      endpoint: z.string().url(),
      apiKeyEnvVar: z.string().min(1),
      models: z.array(z.string()).min(1),
    },
    async (params) => {
      store.saveProviderConfig({
        name: params.name,
        endpoint: params.endpoint,
        apiKeyEnvVar: params.apiKeyEnvVar,
        models: params.models,
      });

      const modelCapabilities: ModelCapability[] = params.models.map((modelId) => ({
        modelId,
        maxTokens: 128000,
        supportsStreaming: true,
        inputCostPer1kTokens: 0.001,
        outputCostPer1kTokens: 0.002,
      }));

      const provider = new DefaultProvider(params.name, modelCapabilities);
      registry.register(provider);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ registered: true, name: params.name, models: params.models }),
        }],
      };
    },
  );

  server.tool(
    "provider_health",
    {
      providerName: z.string().min(1),
    },
    async ({ providerName }) => {
      const provider = registry.get(providerName);
      if (provider === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Provider '${providerName}' not found` }),
          }],
        };
      }

      const health = {
        name: provider.name,
        available: provider.isAvailable(),
        modelCount: provider.models.length,
        latencyMs: latencyMap.get(provider.name) ?? null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(health) }] };
    },
  );

  server.tool(
    "provider_costs",
    {
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    },
    async ({ inputTokens, outputTokens }) => {
      const estimates = registry.list().map((p) => {
        const primaryModel = p.models[0];
        const modelId = primaryModel?.modelId ?? "unknown";
        return {
          providerName: p.name,
          modelId,
          estimatedCostUsd: p.estimateCost(inputTokens, outputTokens, modelId),
          available: p.isAvailable(),
        };
      }).sort((a, b) => a.estimatedCostUsd - b.estimatedCostUsd);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ inputTokens, outputTokens, estimates }),
        }],
      };
    },
  );

  server.tool(
    "provider_failover_config",
    {
      action: z.enum(["get", "set"]).default("get"),
      errorCategory: z.enum(["rate_limit", "unavailable", "timeout", "server_error", "unknown"]).optional(),
      currentProvider: z.string().optional(),
      errorStatus: z.number().int().optional(),
      errorCode: z.string().optional(),
      errorMessage: z.string().optional(),
    },
    async (params) => {
      if (params.action === "set" && params.errorCategory !== undefined && params.currentProvider !== undefined) {
        const availableProviders = registry.getAvailable();
        const fallback = selectFailoverProvider(
          params.errorCategory,
          params.currentProvider,
          availableProviders,
          latencyMap,
        );
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              errorCategory: params.errorCategory,
              currentProvider: params.currentProvider,
              fallbackProvider: fallback,
            }),
          }],
        };
      }

      if (params.errorStatus !== undefined || params.errorCode !== undefined || params.errorMessage !== undefined) {
        const category = classifyError({
          status: params.errorStatus,
          code: params.errorCode,
          message: params.errorMessage,
        });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ classifiedCategory: category }),
          }],
        };
      }

      const rules = [
        { errorCategory: "rate_limit", fallbackStrategy: "cheapest available provider" },
        { errorCategory: "unavailable", fallbackStrategy: "any available provider" },
        { errorCategory: "timeout", fallbackStrategy: "lowest latency provider" },
        { errorCategory: "server_error", fallbackStrategy: "next provider in list" },
        { errorCategory: "unknown", fallbackStrategy: "none (manual intervention)" },
      ];

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ failoverRules: rules }),
        }],
      };
    },
  );

  server.tool(
    "provider_stats",
    {
      windowDays: z.number().int().positive().default(30),
    },
    async ({ windowDays }) => {
      const stats = store.getRoutingStats(windowDays);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ windowDays, ...stats }),
        }],
      };
    },
  );

  return server;
}

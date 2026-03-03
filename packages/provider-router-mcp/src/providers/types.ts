export interface ModelCapability {
  readonly modelId: string;
  readonly maxTokens: number;
  readonly supportsStreaming: boolean;
  readonly inputCostPer1kTokens: number;
  readonly outputCostPer1kTokens: number;
}

export interface IProvider {
  readonly name: string;
  readonly models: readonly ModelCapability[];
  isAvailable(): boolean;
  estimateCost(inputTokens: number, outputTokens: number, modelId: string): number;
}

export interface RoutingRequest {
  readonly capabilityLevel: "basic" | "standard" | "advanced";
  readonly maxCostUsd?: number;
  readonly preferredProvider?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface CostEstimate {
  readonly providerName: string;
  readonly modelId: string;
  readonly estimatedCostUsd: number;
  readonly available: boolean;
}

export interface RoutingResult {
  readonly selectedProvider: string;
  readonly selectedModel: string;
  readonly estimatedCostUsd: number;
  readonly strategy: string;
  readonly alternatives: readonly CostEstimate[];
}

export type RoutingStrategy = "cost-based" | "round-robin" | "latency-based" | "least-loaded";

export type ErrorCategory = "rate_limit" | "unavailable" | "timeout" | "server_error" | "unknown";

export interface FailoverRule {
  readonly errorCategory: ErrorCategory;
  readonly fallbackStrategy: string;
}

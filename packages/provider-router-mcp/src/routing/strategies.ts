import type { IProvider, RoutingRequest, RoutingResult, CostEstimate } from "../providers/types.js";

function buildCostEstimates(providers: IProvider[], request: RoutingRequest): CostEstimate[] {
  return providers.map((provider) => {
    const primaryModel = provider.models[0];
    const modelId = primaryModel?.modelId ?? "unknown";
    const estimatedCostUsd = provider.estimateCost(
      request.inputTokens,
      request.outputTokens,
      modelId,
    );
    return {
      providerName: provider.name,
      modelId,
      estimatedCostUsd,
      available: provider.isAvailable(),
    };
  });
}

function filterCandidates(
  providers: IProvider[],
  request: RoutingRequest,
): IProvider[] {
  const available = providers.filter((p) => p.isAvailable());

  if (request.preferredProvider !== undefined) {
    const preferred = available.find((p) => p.name === request.preferredProvider);
    if (preferred !== undefined) {
      const cost = preferred.estimateCost(
        request.inputTokens,
        request.outputTokens,
        preferred.models[0]?.modelId ?? "unknown",
      );
      if (request.maxCostUsd === undefined || cost <= request.maxCostUsd) {
        return [preferred];
      }
    }
  }

  if (request.maxCostUsd !== undefined) {
    return available.filter((p) => {
      const cost = p.estimateCost(
        request.inputTokens,
        request.outputTokens,
        p.models[0]?.modelId ?? "unknown",
      );
      return cost <= request.maxCostUsd!;
    });
  }

  return available;
}

export function routeByCost(
  providers: IProvider[],
  request: RoutingRequest,
): RoutingResult | null {
  const candidates = filterCandidates(providers, request);
  if (candidates.length === 0) {
    return null;
  }

  const allEstimates = buildCostEstimates(providers, request);

  let cheapest = candidates[0]!;
  let cheapestCost = cheapest.estimateCost(
    request.inputTokens,
    request.outputTokens,
    cheapest.models[0]?.modelId ?? "unknown",
  );

  for (const provider of candidates.slice(1)) {
    const cost = provider.estimateCost(
      request.inputTokens,
      request.outputTokens,
      provider.models[0]?.modelId ?? "unknown",
    );
    if (cost < cheapestCost) {
      cheapest = provider;
      cheapestCost = cost;
    }
  }

  const selectedModel = cheapest.models[0]?.modelId ?? "unknown";
  return {
    selectedProvider: cheapest.name,
    selectedModel,
    estimatedCostUsd: cheapestCost,
    strategy: "cost-based",
    alternatives: allEstimates.filter((e) => e.providerName !== cheapest.name),
  };
}

export function routeByRoundRobin(
  providers: IProvider[],
  request: RoutingRequest,
  counter: number,
): RoutingResult | null {
  const candidates = filterCandidates(providers, request);
  if (candidates.length === 0) {
    return null;
  }

  const allEstimates = buildCostEstimates(providers, request);
  const selected = candidates[counter % candidates.length]!;
  const selectedModel = selected.models[0]?.modelId ?? "unknown";
  const estimatedCostUsd = selected.estimateCost(
    request.inputTokens,
    request.outputTokens,
    selectedModel,
  );

  return {
    selectedProvider: selected.name,
    selectedModel,
    estimatedCostUsd,
    strategy: "round-robin",
    alternatives: allEstimates.filter((e) => e.providerName !== selected.name),
  };
}

export function routeByLatency(
  providers: IProvider[],
  request: RoutingRequest,
  latencyMap: Map<string, number>,
): RoutingResult | null {
  const candidates = filterCandidates(providers, request);
  if (candidates.length === 0) {
    return null;
  }

  const allEstimates = buildCostEstimates(providers, request);

  let fastest = candidates[0]!;
  let fastestLatency = latencyMap.get(fastest.name) ?? Number.MAX_SAFE_INTEGER;

  for (const provider of candidates.slice(1)) {
    const latency = latencyMap.get(provider.name) ?? Number.MAX_SAFE_INTEGER;
    if (latency < fastestLatency) {
      fastest = provider;
      fastestLatency = latency;
    }
  }

  const selectedModel = fastest.models[0]?.modelId ?? "unknown";
  const estimatedCostUsd = fastest.estimateCost(
    request.inputTokens,
    request.outputTokens,
    selectedModel,
  );

  return {
    selectedProvider: fastest.name,
    selectedModel,
    estimatedCostUsd,
    strategy: "latency-based",
    alternatives: allEstimates.filter((e) => e.providerName !== fastest.name),
  };
}

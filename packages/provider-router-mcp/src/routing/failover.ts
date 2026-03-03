import type { IProvider, ErrorCategory } from "../providers/types.js";

export function classifyError(error: {
  status?: number;
  code?: string;
  message?: string;
}): ErrorCategory {
  const message = (error.message ?? "").toLowerCase();
  const status = error.status;
  const code = error.code ?? "";

  if (status === 429 || message.includes("rate") || message.includes("quota")) {
    return "rate_limit";
  }

  if (status === 503 || message.includes("down")) {
    return "unavailable";
  }

  if (code === "ETIMEDOUT" || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }

  if (status === 500 || status === 502 || status === 504) {
    return "server_error";
  }

  return "unknown";
}

export function selectFailoverProvider(
  errorCategory: ErrorCategory,
  currentProvider: string,
  availableProviders: IProvider[],
  latencyMap: Map<string, number>,
): string | null {
  const candidates = availableProviders.filter(
    (p) => p.isAvailable() && p.name !== currentProvider,
  );

  if (candidates.length === 0) {
    return null;
  }

  if (errorCategory === "rate_limit") {
    const cheapest = candidates.reduce(
      (best, provider) => {
        const cost = provider.estimateCost(1000, 500, provider.models[0]?.modelId ?? "unknown");
        const bestCost = best.estimateCost(1000, 500, best.models[0]?.modelId ?? "unknown");
        return cost < bestCost ? provider : best;
      },
      candidates[0]!,
    );
    return cheapest.name;
  }

  if (errorCategory === "unavailable") {
    return candidates[0]!.name;
  }

  if (errorCategory === "timeout") {
    const fastest = candidates.reduce(
      (best, provider) => {
        const latency = latencyMap.get(provider.name) ?? Number.MAX_SAFE_INTEGER;
        const bestLatency = latencyMap.get(best.name) ?? Number.MAX_SAFE_INTEGER;
        return latency < bestLatency ? provider : best;
      },
      candidates[0]!,
    );
    return fastest.name;
  }

  if (errorCategory === "server_error") {
    return candidates[0]!.name;
  }

  return null;
}

import { describe, it, expect } from "vitest";
import { routeByCost, routeByRoundRobin, routeByLatency } from "../src/routing/strategies.js";
import type { IProvider, ModelCapability, RoutingRequest } from "../src/providers/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeProvider(
  name: string,
  inputCostPer1k: number,
  outputCostPer1k: number,
  available = true,
): IProvider {
  const model: ModelCapability = {
    modelId: `${name}-model`,
    maxTokens: 128000,
    supportsStreaming: true,
    inputCostPer1kTokens: inputCostPer1k,
    outputCostPer1kTokens: outputCostPer1k,
  };

  return {
    name,
    models: [model],
    isAvailable: () => available,
    estimateCost: (inputTokens: number, outputTokens: number) => {
      const input = (inputTokens / 1000) * inputCostPer1k;
      const output = (outputTokens / 1000) * outputCostPer1k;
      return input + output;
    },
  };
}

const baseRequest: RoutingRequest = {
  capabilityLevel: "standard",
  inputTokens: 1000,
  outputTokens: 500,
};

// ---------------------------------------------------------------------------
// routeByCost
// ---------------------------------------------------------------------------

describe("routeByCost", () => {
  it("picks the cheapest provider", () => {
    const cheap = makeProvider("cheap", 0.001, 0.002);
    const expensive = makeProvider("expensive", 0.01, 0.02);
    const result = routeByCost([expensive, cheap], baseRequest);
    expect(result?.selectedProvider).toBe("cheap");
    expect(result?.strategy).toBe("cost-based");
  });

  it("respects maxCostUsd constraint by excluding over-budget providers", () => {
    const cheap = makeProvider("cheap", 0.001, 0.002);
    const pricey = makeProvider("pricey", 0.1, 0.2);
    const request: RoutingRequest = { ...baseRequest, maxCostUsd: 0.005 };
    const result = routeByCost([cheap, pricey], request);
    expect(result?.selectedProvider).toBe("cheap");
  });

  it("returns null when all providers are over budget", () => {
    const expensive = makeProvider("expensive", 0.5, 1.0);
    const request: RoutingRequest = { ...baseRequest, maxCostUsd: 0.0001 };
    const result = routeByCost([expensive], request);
    expect(result).toBeNull();
  });

  it("prefers the preferred provider when it is available and within budget", () => {
    const cheap = makeProvider("cheap", 0.001, 0.002);
    const preferred = makeProvider("preferred", 0.005, 0.01);
    const request: RoutingRequest = { ...baseRequest, preferredProvider: "preferred" };
    const result = routeByCost([cheap, preferred], request);
    expect(result?.selectedProvider).toBe("preferred");
  });

  it("falls through to cheapest when preferred provider is unavailable", () => {
    const cheap = makeProvider("cheap", 0.001, 0.002);
    const preferred = makeProvider("preferred", 0.005, 0.01, false);
    const request: RoutingRequest = { ...baseRequest, preferredProvider: "preferred" };
    const result = routeByCost([cheap, preferred], request);
    expect(result?.selectedProvider).toBe("cheap");
  });

  it("filters out unavailable providers", () => {
    const available = makeProvider("available", 0.01, 0.02);
    const unavailable = makeProvider("unavailable", 0.001, 0.002, false);
    const result = routeByCost([unavailable, available], baseRequest);
    expect(result?.selectedProvider).toBe("available");
  });

  it("returns null when no providers are available", () => {
    const p1 = makeProvider("p1", 0.001, 0.002, false);
    const p2 = makeProvider("p2", 0.002, 0.004, false);
    const result = routeByCost([p1, p2], baseRequest);
    expect(result).toBeNull();
  });

  it("includes alternatives in result", () => {
    const cheap = makeProvider("cheap", 0.001, 0.002);
    const expensive = makeProvider("expensive", 0.01, 0.02);
    const result = routeByCost([cheap, expensive], baseRequest);
    expect(result?.alternatives).toHaveLength(1);
    expect(result?.alternatives[0]?.providerName).toBe("expensive");
  });
});

// ---------------------------------------------------------------------------
// routeByRoundRobin
// ---------------------------------------------------------------------------

describe("routeByRoundRobin", () => {
  it("cycles through providers based on counter", () => {
    const p1 = makeProvider("p1", 0.001, 0.002);
    const p2 = makeProvider("p2", 0.002, 0.004);
    const p3 = makeProvider("p3", 0.003, 0.006);
    const providers = [p1, p2, p3];

    const r0 = routeByRoundRobin(providers, baseRequest, 0);
    const r1 = routeByRoundRobin(providers, baseRequest, 1);
    const r2 = routeByRoundRobin(providers, baseRequest, 2);
    const r3 = routeByRoundRobin(providers, baseRequest, 3);

    expect(r0?.selectedProvider).toBe("p1");
    expect(r1?.selectedProvider).toBe("p2");
    expect(r2?.selectedProvider).toBe("p3");
    expect(r3?.selectedProvider).toBe("p1");
  });

  it("returns null when no providers are available", () => {
    const p1 = makeProvider("p1", 0.001, 0.002, false);
    const result = routeByRoundRobin([p1], baseRequest, 0);
    expect(result).toBeNull();
  });

  it("uses round-robin strategy label", () => {
    const p1 = makeProvider("p1", 0.001, 0.002);
    const result = routeByRoundRobin([p1], baseRequest, 0);
    expect(result?.strategy).toBe("round-robin");
  });
});

// ---------------------------------------------------------------------------
// routeByLatency
// ---------------------------------------------------------------------------

describe("routeByLatency", () => {
  it("picks the provider with lowest latency", () => {
    const fast = makeProvider("fast", 0.01, 0.02);
    const slow = makeProvider("slow", 0.001, 0.002);
    const latencyMap = new Map<string, number>([
      ["fast", 50],
      ["slow", 500],
    ]);
    const result = routeByLatency([fast, slow], baseRequest, latencyMap);
    expect(result?.selectedProvider).toBe("fast");
    expect(result?.strategy).toBe("latency-based");
  });

  it("returns null when no providers are available", () => {
    const p1 = makeProvider("p1", 0.001, 0.002, false);
    const latencyMap = new Map<string, number>([["p1", 100]]);
    const result = routeByLatency([p1], baseRequest, latencyMap);
    expect(result).toBeNull();
  });

  it("treats missing latency as MAX_SAFE_INTEGER so known latency wins", () => {
    const known = makeProvider("known", 0.01, 0.02);
    const unknown = makeProvider("unknown", 0.001, 0.002);
    const latencyMap = new Map<string, number>([["known", 200]]);
    const result = routeByLatency([known, unknown], baseRequest, latencyMap);
    expect(result?.selectedProvider).toBe("known");
  });
});

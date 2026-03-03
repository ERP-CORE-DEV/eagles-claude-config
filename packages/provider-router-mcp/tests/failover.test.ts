import { describe, it, expect } from "vitest";
import { classifyError, selectFailoverProvider } from "../src/routing/failover.js";
import type { IProvider, ModelCapability } from "../src/providers/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeProvider(name: string, available = true): IProvider {
  const model: ModelCapability = {
    modelId: `${name}-model`,
    maxTokens: 128000,
    supportsStreaming: true,
    inputCostPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
  };

  return {
    name,
    models: [model],
    isAvailable: () => available,
    estimateCost: (inputTokens: number, outputTokens: number) =>
      (inputTokens / 1000) * 0.001 + (outputTokens / 1000) * 0.002,
  };
}

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  it("classifies status 429 as rate_limit", () => {
    expect(classifyError({ status: 429 })).toBe("rate_limit");
  });

  it("classifies message containing 'rate' as rate_limit", () => {
    expect(classifyError({ message: "Too many requests - rate exceeded" })).toBe("rate_limit");
  });

  it("classifies message containing 'quota' as rate_limit", () => {
    expect(classifyError({ message: "Quota limit reached for this model" })).toBe("rate_limit");
  });

  it("classifies status 503 as unavailable", () => {
    expect(classifyError({ status: 503 })).toBe("unavailable");
  });

  it("classifies message containing 'down' as unavailable", () => {
    expect(classifyError({ message: "Service is down for maintenance" })).toBe("unavailable");
  });

  it("classifies code ETIMEDOUT as timeout", () => {
    expect(classifyError({ code: "ETIMEDOUT" })).toBe("timeout");
  });

  it("classifies message containing 'timeout' as timeout", () => {
    expect(classifyError({ message: "Request timed out after 30s" })).toBe("timeout");
  });

  it("classifies status 500 as server_error", () => {
    expect(classifyError({ status: 500 })).toBe("server_error");
  });

  it("classifies status 502 as server_error", () => {
    expect(classifyError({ status: 502 })).toBe("server_error");
  });

  it("classifies status 504 as server_error", () => {
    expect(classifyError({ status: 504 })).toBe("server_error");
  });

  it("classifies unknown status as unknown", () => {
    expect(classifyError({ status: 418 })).toBe("unknown");
  });

  it("classifies empty error as unknown", () => {
    expect(classifyError({})).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// selectFailoverProvider
// ---------------------------------------------------------------------------

describe("selectFailoverProvider", () => {
  it("excludes the current provider from failover candidates", () => {
    const current = makeProvider("current");
    const fallback = makeProvider("fallback");
    const result = selectFailoverProvider("server_error", "current", [current, fallback], new Map());
    expect(result).toBe("fallback");
    expect(result).not.toBe("current");
  });

  it("returns null when no other providers are available", () => {
    const current = makeProvider("current");
    const result = selectFailoverProvider("server_error", "current", [current], new Map());
    expect(result).toBeNull();
  });

  it("returns null when all other providers are unavailable", () => {
    const current = makeProvider("current");
    const unavailable = makeProvider("unavailable", false);
    const result = selectFailoverProvider("server_error", "current", [current, unavailable], new Map());
    expect(result).toBeNull();
  });

  it("selects cheapest provider for rate_limit errors", () => {
    const cheap = makeProvider("cheap");
    const expensive = makeProvider("expensive");
    const currentProvider = makeProvider("current");

    const cheapWithCost = {
      ...cheap,
      estimateCost: () => 0.001,
    };
    const expensiveWithCost = {
      ...expensive,
      estimateCost: () => 0.1,
    };

    const result = selectFailoverProvider(
      "rate_limit",
      "current",
      [currentProvider, cheapWithCost, expensiveWithCost],
      new Map(),
    );
    expect(result).toBe("cheap");
  });

  it("selects fastest provider for timeout errors", () => {
    const fast = makeProvider("fast");
    const slow = makeProvider("slow");
    const current = makeProvider("current");
    const latencyMap = new Map<string, number>([
      ["fast", 50],
      ["slow", 2000],
    ]);
    const result = selectFailoverProvider("timeout", "current", [current, fast, slow], latencyMap);
    expect(result).toBe("fast");
  });

  it("returns null for unknown error category", () => {
    const fallback = makeProvider("fallback");
    const current = makeProvider("current");
    const result = selectFailoverProvider("unknown", "current", [current, fallback], new Map());
    expect(result).toBeNull();
  });
});

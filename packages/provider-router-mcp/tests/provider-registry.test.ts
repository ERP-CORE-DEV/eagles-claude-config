import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../src/providers/registry.js";
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
// ProviderRegistry
// ---------------------------------------------------------------------------

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("registers and retrieves a provider by name", () => {
    const provider = makeProvider("anthropic");
    registry.register(provider);
    const retrieved = registry.get("anthropic");
    expect(retrieved).toBe(provider);
    expect(retrieved?.name).toBe("anthropic");
  });

  it("returns null for an unknown provider name", () => {
    const result = registry.get("nonexistent");
    expect(result).toBeNull();
  });

  it("lists all registered providers", () => {
    registry.register(makeProvider("anthropic"));
    registry.register(makeProvider("openai"));
    registry.register(makeProvider("google"));
    const list = registry.list();
    expect(list).toHaveLength(3);
    const names = list.map((p) => p.name);
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("google");
  });

  it("removes a registered provider and returns true", () => {
    registry.register(makeProvider("anthropic"));
    const removed = registry.remove("anthropic");
    expect(removed).toBe(true);
    expect(registry.get("anthropic")).toBeNull();
  });

  it("returns false when removing a provider that does not exist", () => {
    const removed = registry.remove("nonexistent");
    expect(removed).toBe(false);
  });

  it("getAvailable filters out unavailable providers", () => {
    registry.register(makeProvider("available1", true));
    registry.register(makeProvider("unavailable", false));
    registry.register(makeProvider("available2", true));
    const available = registry.getAvailable();
    expect(available).toHaveLength(2);
    const names = available.map((p) => p.name);
    expect(names).toContain("available1");
    expect(names).toContain("available2");
    expect(names).not.toContain("unavailable");
  });

  it("overwrites an existing provider when registered with the same name", () => {
    const original = makeProvider("anthropic", true);
    const replacement = makeProvider("anthropic", false);
    registry.register(original);
    registry.register(replacement);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("anthropic")?.isAvailable()).toBe(false);
  });

  it("returns empty list when no providers are registered", () => {
    expect(registry.list()).toHaveLength(0);
    expect(registry.getAvailable()).toHaveLength(0);
  });
});

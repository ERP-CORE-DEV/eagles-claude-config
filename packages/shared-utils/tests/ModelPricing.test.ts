import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  BUDGET_THRESHOLDS,
  CACHE_DISCOUNT,
  MEMORY_TAGS,
} from "../src/index.js";

describe("MODEL_PRICING", () => {
  it("should have pricing for all expected models", () => {
    const expectedModels = [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "kimi-k2-thinking",
      "deepseek-r1",
      "deepseek-v3",
      "codestral-2501",
    ];
    for (const model of expectedModels) {
      expect(MODEL_PRICING).toHaveProperty(model);
    }
  });

  it("should have positive input and output prices for every model", () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.inputPer1M).toBeGreaterThan(0);
      expect(pricing.outputPer1M).toBeGreaterThan(0);
    }
  });

  it("should have output price >= input price for all models", () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.outputPer1M).toBeGreaterThanOrEqual(pricing.inputPer1M);
    }
  });

  it("should be frozen (immutable)", () => {
    expect(Object.isFrozen(MODEL_PRICING)).toBe(true);
  });
});

describe("BUDGET_THRESHOLDS", () => {
  it("should have warn < critical < halt", () => {
    expect(BUDGET_THRESHOLDS.WARN_USD).toBeLessThan(
      BUDGET_THRESHOLDS.CRITICAL_USD,
    );
    expect(BUDGET_THRESHOLDS.CRITICAL_USD).toBeLessThan(
      BUDGET_THRESHOLDS.HALT_USD,
    );
  });

  it("should be frozen (immutable)", () => {
    expect(Object.isFrozen(BUDGET_THRESHOLDS)).toBe(true);
  });
});

describe("CACHE_DISCOUNT", () => {
  it("should give cache reads a discount (multiplier < 1)", () => {
    expect(CACHE_DISCOUNT.READ_MULTIPLIER).toBeLessThan(1);
    expect(CACHE_DISCOUNT.READ_MULTIPLIER).toBeGreaterThan(0);
  });

  it("should charge premium for cache creation (multiplier > 1)", () => {
    expect(CACHE_DISCOUNT.CREATE_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe("MEMORY_TAGS", () => {
  it("should have at least 5 tags", () => {
    expect(MEMORY_TAGS.length).toBeGreaterThanOrEqual(5);
  });

  it("should contain essential tags", () => {
    expect(MEMORY_TAGS).toContain("lesson");
    expect(MEMORY_TAGS).toContain("pattern");
    expect(MEMORY_TAGS).toContain("security");
    expect(MEMORY_TAGS).toContain("architecture");
  });

  it("should have no duplicates", () => {
    const unique = new Set(MEMORY_TAGS);
    expect(unique.size).toBe(MEMORY_TAGS.length);
  });
});

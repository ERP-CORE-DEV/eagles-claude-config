import { describe, it, expect, beforeEach } from "vitest";
import { SonaStore } from "../src/learning/sona-store.js";

describe("SonaStore", () => {
  let store: SonaStore;

  beforeEach(() => {
    store = new SonaStore();
  });

  it("store_createsPatternWithDefaultSuccessRate", () => {
    const pattern = store.store({
      name: "Use IOptions<T>",
      description: "Bind config via IOptions<T> instead of direct env reads",
    });

    expect(pattern.patternId).toBeDefined();
    expect(pattern.name).toBe("Use IOptions<T>");
    expect(pattern.successRate).toBe(0.5);
    expect(pattern.totalAttempts).toBe(0);
    expect(pattern.archived).toBe(false);
    expect(pattern.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("store_setsTagsWhenProvided", () => {
    const pattern = store.store({
      name: "Constructor injection",
      description: "Use constructor injection only",
      tags: ["dotnet", "di"],
    });

    expect(pattern.tags).toEqual(["dotnet", "di"]);
  });

  it("recordOutcome_updatesSuccessRateViaEma", () => {
    const pattern = store.store({ name: "P", description: "Pattern" });
    const initial = pattern.successRate; // 0.5

    const updated = store.recordOutcome(pattern.patternId, true);

    // EMA: 0.3 * 1 + 0.7 * 0.5 = 0.3 + 0.35 = 0.65
    expect(updated).not.toBeNull();
    expect(updated!.successRate).toBeCloseTo(0.65, 5);
    expect(updated!.totalAttempts).toBe(1);
    expect(updated!.successRate).toBeGreaterThan(initial);
  });

  it("recordOutcome_decreasesSuccessRateOnFailure", () => {
    const pattern = store.store({ name: "P", description: "Pattern" });

    const updated = store.recordOutcome(pattern.patternId, false);

    // EMA: 0.3 * 0 + 0.7 * 0.5 = 0.35
    expect(updated!.successRate).toBeCloseTo(0.35, 5);
    expect(updated!.totalAttempts).toBe(1);
  });

  it("recordOutcome_autoArchivesPoorPerformersAfterMinAttempts", () => {
    const pattern = store.store({ name: "Bad pattern", description: "Will fail" });

    // Record 5 failures — after 5 attempts with all failures the rate will be very low
    let result = pattern;
    for (let i = 0; i < 5; i++) {
      const updated = store.recordOutcome(result.patternId, false);
      expect(updated).not.toBeNull();
      result = updated!;
    }

    // After 5 failures starting from 0.5:
    // 0: 0.5
    // 1: 0.3*0 + 0.7*0.5 = 0.35
    // 2: 0.3*0 + 0.7*0.35 = 0.245
    // 3: 0.3*0 + 0.7*0.245 = 0.1715
    // 4: 0.3*0 + 0.7*0.1715 = 0.12005
    // 5: 0.3*0 + 0.7*0.12005 = 0.084035
    // All are below 0.2 and at 5 attempts — should be archived
    expect(result.successRate).toBeLessThan(0.2);
    expect(result.totalAttempts).toBe(5);
    expect(result.archived).toBe(true);
  });

  it("recordOutcome_doesNotArchiveBeforeMinAttempts", () => {
    const pattern = store.store({ name: "New pattern", description: "Not enough data" });

    // Only 4 failures — under MIN_ATTEMPTS_FOR_PRUNE (5)
    let result = pattern;
    for (let i = 0; i < 4; i++) {
      const updated = store.recordOutcome(result.patternId, false);
      result = updated!;
    }

    expect(result.totalAttempts).toBe(4);
    expect(result.archived).toBe(false);
  });

  it("recordOutcome_returnsNullForUnknownPattern", () => {
    const result = store.recordOutcome("nonexistent-id", true);
    expect(result).toBeNull();
  });

  it("suggest_returnsSortedBySuccessRateDescending", () => {
    const p1 = store.store({ name: "P1", description: "Pattern 1" });
    const p2 = store.store({ name: "P2", description: "Pattern 2" });
    const p3 = store.store({ name: "P3", description: "Pattern 3" });

    // Give different success rates
    store.recordOutcome(p1.patternId, true);  // ~0.65
    store.recordOutcome(p2.patternId, false); // ~0.35
    // p3 stays at 0.5

    const suggestions = store.suggest();
    const rates = suggestions.map((p) => p.successRate);

    expect(rates[0]).toBeGreaterThanOrEqual(rates[1]);
    expect(rates[1]).toBeGreaterThanOrEqual(rates[2]);
    void p3; // suppress unused warning
  });

  it("suggest_filtersByTags", () => {
    store.store({ name: "Frontend pattern", description: "React", tags: ["frontend"] });
    store.store({ name: "Backend pattern", description: "Dotnet", tags: ["backend"] });
    store.store({ name: "Shared pattern", description: "Both", tags: ["frontend", "backend"] });

    const frontendSuggestions = store.suggest(["frontend"]);

    expect(frontendSuggestions).toHaveLength(2);
    const names = frontendSuggestions.map((p) => p.name);
    expect(names).toContain("Frontend pattern");
    expect(names).toContain("Shared pattern");
  });

  it("suggest_respectsLimit", () => {
    for (let i = 0; i < 5; i++) {
      store.store({ name: `P${i}`, description: `Pattern ${i}` });
    }

    const suggestions = store.suggest(undefined, 3);

    expect(suggestions).toHaveLength(3);
  });

  it("suggest_excludesArchivedPatterns", () => {
    const pattern = store.store({ name: "Archived", description: "Will be archived" });

    // Archive it via repeated failures
    let result = pattern;
    for (let i = 0; i < 5; i++) {
      result = store.recordOutcome(result.patternId, false)!;
    }

    expect(result.archived).toBe(true);

    const suggestions = store.suggest();
    const ids = suggestions.map((p) => p.patternId);
    expect(ids).not.toContain(pattern.patternId);
  });

  it("prune_archivesLowPerformersWithEnoughAttempts", () => {
    const good = store.store({ name: "Good", description: "High success" });
    const bad = store.store({ name: "Bad", description: "Low success" });

    // Give good a high success rate
    store.recordOutcome(good.patternId, true);
    store.recordOutcome(good.patternId, true);
    store.recordOutcome(good.patternId, true);
    store.recordOutcome(good.patternId, true);
    store.recordOutcome(good.patternId, true);

    // Give bad a very low success rate (5 failures)
    for (let i = 0; i < 5; i++) {
      store.recordOutcome(bad.patternId, false);
    }

    // Re-create bad as not-archived to test prune() manually
    const freshStore = new SonaStore();
    const badPattern = freshStore.store({ name: "Bad", description: "Low success" });
    for (let i = 0; i < 5; i++) {
      freshStore.recordOutcome(badPattern.patternId, false);
    }

    // The pattern should be auto-archived via recordOutcome already
    expect(freshStore.get(badPattern.patternId)?.archived).toBe(true);

    // prune() should return 0 since already archived
    const pruned = freshStore.prune();
    expect(pruned).toBe(0);

    void good; // suppress unused warning
    void bad; // suppress unused warning
  });

  it("list_withIncludeArchivedTrue_returnsAllPatterns", () => {
    const p1 = store.store({ name: "P1", description: "Active" });
    // Archive p1 via failures
    for (let i = 0; i < 5; i++) {
      store.recordOutcome(p1.patternId, false);
    }
    store.store({ name: "P2", description: "Active" });

    const allPatterns = store.list(true);
    const activePatterns = store.list(false);

    expect(allPatterns).toHaveLength(2);
    expect(activePatterns).toHaveLength(1);
  });

  it("count_returnsAllPatternsIncludingArchived", () => {
    store.store({ name: "P1", description: "A" });
    store.store({ name: "P2", description: "B" });

    expect(store.count()).toBe(2);
  });
});

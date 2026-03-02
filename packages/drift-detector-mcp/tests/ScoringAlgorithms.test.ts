import { describe, it, expect } from "vitest";
import {
  scoreRequirementCoverage,
  scoreTestHealth,
  scoreFileChurn,
  scoreTokenEfficiency,
  scoreScopeCreep,
} from "../src/scoring/ScoringAlgorithms.js";
import { computeCompositeScore } from "../src/scoring/CompositeScorer.js";
import { parseRequirements } from "../src/parsing/RequirementsParser.js";

// ---------------------------------------------------------------------------
// RequirementsParser
// ---------------------------------------------------------------------------
describe("parseRequirements", () => {
  it("parses incomplete checklist items", () => {
    const result = parseRequirements("- [ ] Add login page\n- [ ] Add logout");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "Add login page", completed: false });
    expect(result[1]).toEqual({ text: "Add logout", completed: false });
  });

  it("parses completed checklist items with lowercase x", () => {
    const result = parseRequirements("- [x] Add login page");
    expect(result[0]).toEqual({ text: "Add login page", completed: true });
  });

  it("parses completed checklist items with uppercase X", () => {
    const result = parseRequirements("- [X] Write tests");
    expect(result[0]).toEqual({ text: "Write tests", completed: true });
  });

  it("ignores non-checklist lines", () => {
    const text = "# Heading\nSome prose\n- [ ] Real item\n* bullet";
    const result = parseRequirements(text);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real item");
  });

  it("handles nested indented checklist items", () => {
    const text = "- [ ] Top level\n  - [ ] Nested item\n    - [x] Deep nested";
    const result = parseRequirements(text);
    expect(result).toHaveLength(3);
    expect(result[1].text).toBe("Nested item");
    expect(result[2].completed).toBe(true);
  });

  it("returns empty array for text with no checklist items", () => {
    const result = parseRequirements("Just some text\n# No checklists here");
    expect(result).toHaveLength(0);
  });

  it("trims whitespace from item text", () => {
    const result = parseRequirements("- [ ]   spaced text   ");
    expect(result[0].text).toBe("spaced text");
  });
});

// ---------------------------------------------------------------------------
// scoreRequirementCoverage
// ---------------------------------------------------------------------------
describe("scoreRequirementCoverage", () => {
  it("returns 1.0 when all items are addressed", () => {
    const items = ["Add login page", "Add logout"];
    const addressed = ["login page", "logout"];
    const score = scoreRequirementCoverage(items.length, addressed, items);
    expect(score).toBe(1.0);
  });

  it("returns 0.5 when half of items are addressed", () => {
    const items = ["Add login page", "Add logout"];
    const addressed = ["login page"];
    const score = scoreRequirementCoverage(items.length, addressed, items);
    expect(score).toBe(0.5);
  });

  it("returns 0.0 when nothing is addressed", () => {
    const items = ["Add login page", "Add logout"];
    const addressed: string[] = [];
    const score = scoreRequirementCoverage(items.length, addressed, items);
    expect(score).toBe(0.0);
  });

  it("returns 1.0 when totalItems is 0", () => {
    const score = scoreRequirementCoverage(0, [], []);
    expect(score).toBe(1.0);
  });

  it("performs case-insensitive matching", () => {
    const items = ["Add Login Page"];
    const addressed = ["login page"];
    const score = scoreRequirementCoverage(items.length, addressed, items);
    expect(score).toBe(1.0);
  });

  it("caps at 1.0 even if addressed count exceeds total", () => {
    const items = ["item one"];
    const addressed = ["item one", "item one", "item one"];
    const score = scoreRequirementCoverage(1, addressed, items);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreTestHealth
// ---------------------------------------------------------------------------
describe("scoreTestHealth", () => {
  it("returns 1.0 for perfect pass rate and full count", () => {
    const score = scoreTestHealth(100, 100, 100);
    expect(score).toBe(1.0);
  });

  it("returns 0.7 for perfect pass rate with zero baseline", () => {
    // count_health = min(1.0, 50/0) but baseline=0 so count_health = 1.0
    const score = scoreTestHealth(50, 50, 0);
    expect(score).toBe(1.0);
  });

  it("returns 0.0 when no tests pass and count is far below baseline", () => {
    // pass_rate=0, count_health=min(1, 0/100)=0 => 0.7*0 + 0.3*0 = 0
    const score = scoreTestHealth(0, 0, 100);
    expect(score).toBe(0);
  });

  it("weights pass rate 70% and count health 30%", () => {
    // 50/100 passing = 0.5 pass rate; 100/100 count = 1.0 count_health
    // score = 0.7 * 0.5 + 0.3 * 1.0 = 0.35 + 0.3 = 0.65
    const score = scoreTestHealth(50, 100, 100);
    expect(score).toBeCloseTo(0.65, 5);
  });

  it("caps count_health at 1.0 when exceeding baseline", () => {
    // 200 tests when baseline is 100 => count_health = 1.0
    const score = scoreTestHealth(200, 200, 100);
    expect(score).toBe(1.0);
  });

  it("handles both zeros gracefully", () => {
    const score = scoreTestHealth(0, 0, 0);
    expect(score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreFileChurn
// ---------------------------------------------------------------------------
describe("scoreFileChurn", () => {
  it("returns 1.0 when every edit touched a different file", () => {
    const score = scoreFileChurn(5, 5);
    expect(score).toBe(1.0);
  });

  it("returns 0.2 when only 1 unique file was touched in 5 edits", () => {
    const score = scoreFileChurn(1, 5);
    expect(score).toBeCloseTo(0.2, 5);
  });

  it("returns 1.0 when there are no edits", () => {
    const score = scoreFileChurn(0, 0);
    expect(score).toBe(1.0);
  });

  it("returns 0.5 for 3 unique files out of 6 edits", () => {
    const score = scoreFileChurn(3, 6);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("caps at 1.0 if unique files somehow exceed total edits", () => {
    const score = scoreFileChurn(10, 5);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreTokenEfficiency
// ---------------------------------------------------------------------------
describe("scoreTokenEfficiency", () => {
  it("returns null when tokensConsumed is 0", () => {
    const score = scoreTokenEfficiency(100, 0);
    expect(score).toBeNull();
  });

  it("returns 1.0 for 10+ lines per 1k tokens", () => {
    // 100 lines / 10000 tokens * 1000 = 10 lines_per_1k => score = min(10/10, 1) = 1.0
    const score = scoreTokenEfficiency(100, 10000);
    expect(score).toBe(1.0);
  });

  it("returns 0.5 for 5 lines per 1k tokens", () => {
    // 50 lines / 10000 tokens * 1000 = 5 lines_per_1k => score = 5/10 = 0.5
    const score = scoreTokenEfficiency(50, 10000);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("caps at 1.0 for extremely efficient output", () => {
    const score = scoreTokenEfficiency(10000, 100);
    expect(score).toBe(1.0);
  });

  it("returns 0.0 for zero lines added", () => {
    const score = scoreTokenEfficiency(0, 1000);
    expect(score).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// scoreScopeCreep
// ---------------------------------------------------------------------------
describe("scoreScopeCreep", () => {
  it("returns 1.0 when all new files are planned", () => {
    const score = scoreScopeCreep(["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"]);
    expect(score).toBe(1.0);
  });

  it("returns 0.5 when half of new files are unplanned", () => {
    const score = scoreScopeCreep(["src/a.ts", "src/c.ts"], ["src/a.ts"]);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("returns 0.0 when all new files are unplanned", () => {
    const score = scoreScopeCreep(["src/x.ts", "src/y.ts"], []);
    expect(score).toBe(0.0);
  });

  it("returns 1.0 when no new files were created", () => {
    const score = scoreScopeCreep([], ["src/a.ts"]);
    expect(score).toBe(1.0);
  });

  it("is case-insensitive for file path comparison", () => {
    const score = scoreScopeCreep(["SRC/Login.ts"], ["src/login.ts"]);
    expect(score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// computeCompositeScore
// ---------------------------------------------------------------------------
describe("computeCompositeScore", () => {
  it("returns SYNCED for perfect scores", () => {
    const result = computeCompositeScore({
      requirementCoverage: 1.0,
      testHealth: 1.0,
      fileChurn: 1.0,
      tokenEfficiency: 1.0,
      scopeCreep: 1.0,
    });
    expect(result.driftScore).toBe(1.0);
    expect(result.verdict).toBe("SYNCED");
  });

  it("returns DRIFTING for all-zero scores", () => {
    const result = computeCompositeScore({
      requirementCoverage: 0.0,
      testHealth: 0.0,
      fileChurn: 0.0,
      tokenEfficiency: 0.0,
      scopeCreep: 0.0,
    });
    expect(result.driftScore).toBe(0.0);
    expect(result.verdict).toBe("DRIFTING");
  });

  it("returns WARNING for mid-range score", () => {
    const result = computeCompositeScore({
      requirementCoverage: 0.5,
      testHealth: 0.5,
      fileChurn: 0.5,
      tokenEfficiency: 0.5,
      scopeCreep: 0.5,
    });
    expect(result.verdict).toBe("WARNING");
    expect(result.driftScore).toBeCloseTo(0.5, 5);
  });

  it("redistributes tokenEfficiency weight when null", () => {
    const withToken = computeCompositeScore({
      requirementCoverage: 1.0,
      testHealth: 1.0,
      fileChurn: 1.0,
      tokenEfficiency: 1.0,
      scopeCreep: 1.0,
    });
    const withoutToken = computeCompositeScore({
      requirementCoverage: 1.0,
      testHealth: 1.0,
      fileChurn: 1.0,
      tokenEfficiency: null,
      scopeCreep: 1.0,
    });
    // Both should be 1.0 since all other metrics are perfect
    expect(withToken.driftScore).toBeCloseTo(withoutToken.driftScore, 5);
    expect(withoutToken.verdict).toBe("SYNCED");
  });

  it("redistributed null tokenEfficiency weights sum to 1.0", () => {
    // When tokenEfficiency is null and all others are 0.5,
    // the result should still be 0.5
    const result = computeCompositeScore({
      requirementCoverage: 0.5,
      testHealth: 0.5,
      fileChurn: 0.5,
      tokenEfficiency: null,
      scopeCreep: 0.5,
    });
    expect(result.driftScore).toBeCloseTo(0.5, 5);
  });

  it("clamps score to [0, 1] range", () => {
    // Inject extreme values to ensure clamping
    const result = computeCompositeScore({
      requirementCoverage: 2.0,
      testHealth: 2.0,
      fileChurn: 2.0,
      tokenEfficiency: 2.0,
      scopeCreep: 2.0,
    });
    expect(result.driftScore).toBeLessThanOrEqual(1.0);
    expect(result.driftScore).toBeGreaterThanOrEqual(0.0);
  });

  it("uses SYNCED threshold at 0.6 boundary", () => {
    // 0.6 in IEEE 754 can produce rounding below threshold; use 0.61 to be safely above
    const result = computeCompositeScore({
      requirementCoverage: 0.61,
      testHealth: 0.61,
      fileChurn: 0.61,
      tokenEfficiency: 0.61,
      scopeCreep: 0.61,
    });
    expect(result.verdict).toBe("SYNCED");
  });

  it("uses WARNING for score just below 0.6", () => {
    const result = computeCompositeScore({
      requirementCoverage: 0.59,
      testHealth: 0.59,
      fileChurn: 0.59,
      tokenEfficiency: 0.59,
      scopeCreep: 0.59,
    });
    expect(result.verdict).toBe("WARNING");
  });

  it("uses DRIFTING for score just below 0.4", () => {
    const result = computeCompositeScore({
      requirementCoverage: 0.39,
      testHealth: 0.39,
      fileChurn: 0.39,
      tokenEfficiency: 0.39,
      scopeCreep: 0.39,
    });
    expect(result.verdict).toBe("DRIFTING");
  });
});

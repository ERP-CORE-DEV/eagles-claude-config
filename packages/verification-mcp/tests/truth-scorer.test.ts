import { describe, it, expect } from "vitest";
import { assessTruth } from "../src/scoring/truth-scorer.js";

describe("assessTruth", () => {
  it("assessTruth_emptyOutput_returnsRejectWithEmptyOutputFlag", () => {
    const result = assessTruth({ output: "" });

    expect(result.confidence).toBe(0);
    expect(result.suggestedAction).toBe("reject");
    expect(result.flags).toContain("empty_output");
  });

  it("assessTruth_shortOutput_returnsReviewWithSuspiciouslyShortFlag", () => {
    const result = assessTruth({ output: "hi" });

    expect(result.confidence).toBe(0.3);
    expect(result.suggestedAction).toBe("review");
    expect(result.flags).toContain("suspiciously_short");
  });

  it("assessTruth_normalOutput_returnsAcceptWithHighConfidence", () => {
    const result = assessTruth({
      output: "This is a well-formed and meaningful output that passes all checks.",
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.suggestedAction).toBe("accept");
    expect(result.flags).not.toContain("empty_output");
    expect(result.flags).not.toContain("suspiciously_short");
  });

  it("assessTruth_confidenceAlwaysInRange0To1", () => {
    const cases = [
      { output: "" },
      { output: "x" },
      { output: "This is a normal output string with sufficient length." },
      { output: "JSON format", expectedFormat: "json" },
    ];

    for (const params of cases) {
      const result = assessTruth(params);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("assessTruth_flagsArrayPresentForEachCase", () => {
    const emptyResult = assessTruth({ output: "" });
    const shortResult = assessTruth({ output: "tiny" });
    const normalResult = assessTruth({ output: "Normal length output that is well formed." });

    expect(Array.isArray(emptyResult.flags)).toBe(true);
    expect(Array.isArray(shortResult.flags)).toBe(true);
    expect(Array.isArray(normalResult.flags)).toBe(true);
    expect(emptyResult.flags.length).toBeGreaterThan(0);
    expect(shortResult.flags.length).toBeGreaterThan(0);
  });
});

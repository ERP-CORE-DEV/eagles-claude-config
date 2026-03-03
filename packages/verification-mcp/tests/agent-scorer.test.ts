import { describe, it, expect } from "vitest";
import { scoreAgent } from "../src/scoring/agent-scorer.js";
import type { ScoreObservation } from "../src/scoring/types.js";

const DIMENSION_WEIGHTS = {
  accuracy: 0.30,
  reliability: 0.25,
  consistency: 0.20,
  efficiency: 0.15,
  adaptability: 0.10,
};

function makeObs(
  dimension: ScoreObservation["dimension"],
  value: number,
  ageMs: number = 0,
): ScoreObservation {
  return {
    dimension,
    value,
    timestamp: new Date(Date.now() - ageMs).toISOString(),
  };
}

describe("scoreAgent", () => {
  it("scoreAgent_singleObservationPerDimension_returnsExpectedComposite", () => {
    const observations: ScoreObservation[] = [
      makeObs("accuracy", 1.0),
      makeObs("reliability", 1.0),
      makeObs("consistency", 1.0),
      makeObs("efficiency", 1.0),
      makeObs("adaptability", 1.0),
    ];

    const result = scoreAgent(observations);

    expect(result.accuracy).toBeCloseTo(1.0, 5);
    expect(result.reliability).toBeCloseTo(1.0, 5);
    expect(result.consistency).toBeCloseTo(1.0, 5);
    expect(result.efficiency).toBeCloseTo(1.0, 5);
    expect(result.adaptability).toBeCloseTo(1.0, 5);
    expect(result.composite).toBeCloseTo(1.0, 5);
  });

  it("scoreAgent_multipleObservations_appliesDecayToOlderValues", () => {
    const recentTimestamp = new Date(Date.now()).toISOString();
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const observations: ScoreObservation[] = [
      { dimension: "accuracy", value: 1.0, timestamp: recentTimestamp },
      { dimension: "accuracy", value: 0.0, timestamp: oldTimestamp },
    ];

    const result = scoreAgent(observations, 24);

    // Recent high-value observation should dominate over decayed old low-value observation
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("scoreAgent_compositeAbove0Point85_returnsRiskLevelLow", () => {
    const observations: ScoreObservation[] = [
      makeObs("accuracy", 0.95),
      makeObs("reliability", 0.90),
      makeObs("consistency", 0.90),
      makeObs("efficiency", 0.90),
      makeObs("adaptability", 0.90),
    ];

    const result = scoreAgent(observations);

    expect(result.composite).toBeGreaterThanOrEqual(0.85);
    expect(result.riskLevel).toBe("LOW");
  });

  it("scoreAgent_compositeBelow0Point50_returnsRiskLevelCritical", () => {
    const observations: ScoreObservation[] = [
      makeObs("accuracy", 0.3),
      makeObs("reliability", 0.3),
      makeObs("consistency", 0.3),
      makeObs("efficiency", 0.3),
      makeObs("adaptability", 0.3),
    ];

    const result = scoreAgent(observations);

    expect(result.composite).toBeLessThan(0.50);
    expect(result.riskLevel).toBe("CRITICAL");
  });

  it("scoreAgent_emptyObservations_returnsZeroScores", () => {
    const result = scoreAgent([]);

    expect(result.accuracy).toBe(0);
    expect(result.reliability).toBe(0);
    expect(result.consistency).toBe(0);
    expect(result.efficiency).toBe(0);
    expect(result.adaptability).toBe(0);
    expect(result.composite).toBe(0);
    expect(result.riskLevel).toBe("CRITICAL");
  });

  it("dimensionWeights_sumToOne", () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });
});

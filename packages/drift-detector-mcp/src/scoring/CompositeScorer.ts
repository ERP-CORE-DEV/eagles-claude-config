// CompositeScorer — weighted aggregation of the five drift metrics.
// When tokenEfficiency is null its weight (0.15) is redistributed
// proportionally across the remaining four metrics.

export type Verdict = "SYNCED" | "WARNING" | "DRIFTING";

export interface MetricInputs {
  readonly requirementCoverage: number;
  readonly testHealth: number;
  readonly fileChurn: number;
  readonly tokenEfficiency: number | null;
  readonly scopeCreep: number;
}

export interface CompositeResult {
  readonly driftScore: number;
  readonly verdict: Verdict;
}

const BASE_WEIGHTS = {
  requirementCoverage: 0.30,
  testHealth: 0.25,
  fileChurn: 0.15,
  tokenEfficiency: 0.15,
  scopeCreep: 0.15,
} as const;

const VERDICT_SYNCED_THRESHOLD = 0.6;
const VERDICT_WARNING_THRESHOLD = 0.4;

export function computeCompositeScore(metrics: MetricInputs): CompositeResult {
  let weights = { ...BASE_WEIGHTS };

  if (metrics.tokenEfficiency === null) {
    const redistributed = weights.tokenEfficiency;
    const otherTotal =
      weights.requirementCoverage +
      weights.testHealth +
      weights.fileChurn +
      weights.scopeCreep;

    weights = {
      requirementCoverage:
        weights.requirementCoverage + redistributed * (weights.requirementCoverage / otherTotal),
      testHealth:
        weights.testHealth + redistributed * (weights.testHealth / otherTotal),
      fileChurn:
        weights.fileChurn + redistributed * (weights.fileChurn / otherTotal),
      tokenEfficiency: 0,
      scopeCreep:
        weights.scopeCreep + redistributed * (weights.scopeCreep / otherTotal),
    };
  }

  const tokenScore = metrics.tokenEfficiency ?? 0;

  const driftScore =
    metrics.requirementCoverage * weights.requirementCoverage +
    metrics.testHealth * weights.testHealth +
    metrics.fileChurn * weights.fileChurn +
    tokenScore * weights.tokenEfficiency +
    metrics.scopeCreep * weights.scopeCreep;

  const clamped = Math.max(0, Math.min(1, driftScore));

  const verdict: Verdict =
    clamped >= VERDICT_SYNCED_THRESHOLD
      ? "SYNCED"
      : clamped >= VERDICT_WARNING_THRESHOLD
        ? "WARNING"
        : "DRIFTING";

  return { driftScore: clamped, verdict };
}

// CompositeScorer — weighted aggregation of the five drift metrics.
// When tokenEfficiency is null its weight (0.15) is redistributed
// proportionally across the remaining four metrics.

import type { DriftTrend } from "@eagles-advanced/shared-utils";

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

// ---------------------------------------------------------------------------
// Trend with exponential decay — adapted from ruflo's agent-scorer.ts
// ---------------------------------------------------------------------------

export interface TimestampedScore {
  readonly score: number;
  readonly computedAt: string;
}

export interface TrendResult {
  readonly weightedScore: number;
  readonly trend: DriftTrend;
  readonly confidence: number;
  readonly rawScores: readonly number[];
  readonly decayWeights: readonly number[];
}

const DEFAULT_HALF_LIFE_HOURS = 24;
const MIN_WAVES_FOR_CONFIDENCE = 3;

export function computeTrendWithDecay(
  scores: readonly TimestampedScore[],
  halfLifeHours: number = DEFAULT_HALF_LIFE_HOURS,
): TrendResult {
  if (scores.length === 0) {
    return {
      weightedScore: 0,
      trend: "STABLE",
      confidence: 0,
      rawScores: [],
      decayWeights: [],
    };
  }

  const now = Date.now();
  const rawScores = scores.map((s) => s.score);

  // Compute exponential decay weights: w = e^(-ageHours / halfLife)
  const decayWeights = scores.map((s) => {
    const ageMs = now - new Date(s.computedAt).getTime();
    const ageHours = Math.max(0, ageMs / 3_600_000);
    return Math.exp(-ageHours / halfLifeHours);
  });

  // Weighted average
  const totalWeight = decayWeights.reduce((sum, w) => sum + w, 0);
  const weightedScore = totalWeight > 0
    ? decayWeights.reduce((sum, w, i) => sum + w * rawScores[i]!, 0) / totalWeight
    : 0;

  // Trend via linear regression on decay-weighted scores
  const trend = classifyTrend(rawScores);

  // Confidence: low if fewer than MIN_WAVES_FOR_CONFIDENCE data points
  const confidence = scores.length >= MIN_WAVES_FOR_CONFIDENCE
    ? Math.min(1, scores.length / 10)
    : scores.length / MIN_WAVES_FOR_CONFIDENCE * 0.5;

  return {
    weightedScore: Math.max(0, Math.min(1, weightedScore)),
    trend,
    confidence: Math.max(0, Math.min(1, confidence)),
    rawScores,
    decayWeights,
  };
}

function classifyTrend(scores: readonly number[]): DriftTrend {
  if (scores.length < 2) return "STABLE";

  // Simple linear regression: y = mx + b
  const n = scores.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += scores[i]!;
    sumXY += i * scores[i]!;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  if (slope > 0.02) return "IMPROVING";
  if (slope < -0.02) return "DEGRADING";
  return "STABLE";
}

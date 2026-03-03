import type { AgentScore, ScoreObservation } from "./types.js";

const DIMENSION_WEIGHTS = {
  accuracy: 0.30,
  reliability: 0.25,
  consistency: 0.20,
  efficiency: 0.15,
  adaptability: 0.10,
} as const;

const RISK_THRESHOLDS = {
  LOW: 0.85,
  MEDIUM: 0.70,
  HIGH: 0.50,
} as const;

function computeDecayedAverage(
  observations: readonly ScoreObservation[],
  halfLifeHours: number,
  now: number,
): number {
  if (observations.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const obs of observations) {
    const ageMs = now - new Date(obs.timestamp).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    const weight = Math.exp(-ageHours / halfLifeHours);
    weightedSum += obs.value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}

function determineRiskLevel(composite: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (composite >= RISK_THRESHOLDS.LOW) {
    return "LOW";
  }
  if (composite >= RISK_THRESHOLDS.MEDIUM) {
    return "MEDIUM";
  }
  if (composite >= RISK_THRESHOLDS.HIGH) {
    return "HIGH";
  }
  return "CRITICAL";
}

export function scoreAgent(
  observations: readonly ScoreObservation[],
  halfLifeHours: number = 24,
): AgentScore {
  const now = Date.now();

  const byDimension: Record<string, ScoreObservation[]> = {
    accuracy: [],
    reliability: [],
    consistency: [],
    efficiency: [],
    adaptability: [],
  };

  for (const obs of observations) {
    byDimension[obs.dimension].push(obs);
  }

  const accuracy = computeDecayedAverage(byDimension["accuracy"], halfLifeHours, now);
  const reliability = computeDecayedAverage(byDimension["reliability"], halfLifeHours, now);
  const consistency = computeDecayedAverage(byDimension["consistency"], halfLifeHours, now);
  const efficiency = computeDecayedAverage(byDimension["efficiency"], halfLifeHours, now);
  const adaptability = computeDecayedAverage(byDimension["adaptability"], halfLifeHours, now);

  const composite =
    accuracy * DIMENSION_WEIGHTS.accuracy +
    reliability * DIMENSION_WEIGHTS.reliability +
    consistency * DIMENSION_WEIGHTS.consistency +
    efficiency * DIMENSION_WEIGHTS.efficiency +
    adaptability * DIMENSION_WEIGHTS.adaptability;

  const riskLevel = determineRiskLevel(composite);

  return {
    accuracy,
    reliability,
    consistency,
    efficiency,
    adaptability,
    composite,
    riskLevel,
  };
}

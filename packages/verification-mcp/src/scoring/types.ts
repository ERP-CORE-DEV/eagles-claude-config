export interface AgentScore {
  readonly accuracy: number;
  readonly reliability: number;
  readonly consistency: number;
  readonly efficiency: number;
  readonly adaptability: number;
  readonly composite: number;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ScoreObservation {
  readonly dimension: "accuracy" | "reliability" | "consistency" | "efficiency" | "adaptability";
  readonly value: number;
  readonly timestamp: string;
}

export interface TruthAssessment {
  readonly confidence: number;
  readonly flags: readonly string[];
  readonly suggestedAction: "accept" | "review" | "reject";
}

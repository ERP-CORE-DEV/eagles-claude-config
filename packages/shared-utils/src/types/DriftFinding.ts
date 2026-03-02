export type AlertLevel = "NONE" | "WARNING" | "BLOCK";
export type OverallHealth = "HEALTHY" | "WARNING" | "CRITICAL";
export type DriftTrend = "IMPROVING" | "STABLE" | "DEGRADING";

export interface DriftFinding {
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly driftScore: number;
  readonly alertLevel: AlertLevel;
  readonly metrics: {
    readonly requirementCoverage: number;
    readonly testHealth: number;
    readonly fileChurn: number;
    readonly tokenEfficiency: number | null;
    readonly scopeCreep: number;
  };
  readonly computedAt: string;
}

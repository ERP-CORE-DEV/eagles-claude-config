export interface TokenRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly modelName: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly estimatedCostUsd: number;
  readonly recordedAt: string;
  readonly waveNumber: number | null;
  readonly agentName: string | null;
  readonly toolName: string | null;
}

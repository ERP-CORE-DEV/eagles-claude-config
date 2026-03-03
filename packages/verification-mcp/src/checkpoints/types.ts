export interface Checkpoint {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly stateJson: string;
  readonly agentScore: number | null;
  readonly verified: boolean;
  readonly createdAt: string;
}

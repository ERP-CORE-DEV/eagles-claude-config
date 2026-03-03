import type { Checkpoint } from "./types.js";
import type { VerificationStore } from "../store/VerificationStore.js";

export class CheckpointManager {
  constructor(private readonly store: VerificationStore) {}

  create(params: {
    readonly sessionId: string;
    readonly name: string;
    readonly stateJson: string;
    readonly agentScore?: number;
  }): Checkpoint {
    return this.store.insertCheckpoint({
      sessionId: params.sessionId,
      name: params.name,
      stateJson: params.stateJson,
      agentScore: params.agentScore ?? null,
    });
  }

  restore(checkpointId: string): Checkpoint | null {
    return this.store.getCheckpoint(checkpointId);
  }

  listForSession(sessionId: string): Checkpoint[] {
    return this.store.listCheckpoints(sessionId);
  }

  getLastGood(sessionId: string): Checkpoint | null {
    return this.store.getLastVerifiedCheckpoint(sessionId);
  }

  verify(checkpointId: string): void {
    this.store.markVerified(checkpointId);
  }
}

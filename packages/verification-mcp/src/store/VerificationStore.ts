import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { AgentScore, TruthAssessment } from "../scoring/types.js";
import type { Checkpoint } from "../checkpoints/types.js";

export interface AgentScoreRow {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly accuracy: number;
  readonly reliability: number;
  readonly consistency: number;
  readonly efficiency: number;
  readonly adaptability: number;
  readonly composite: number;
  readonly riskLevel: string;
  readonly computedAt: string;
}

export interface VerificationRow {
  readonly id: string;
  readonly sessionId: string;
  readonly confidence: number;
  readonly suggestedAction: string;
  readonly flags: readonly string[];
  readonly verifiedAt: string;
}

export class VerificationStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_scores (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        accuracy REAL NOT NULL,
        reliability REAL NOT NULL,
        consistency REAL NOT NULL,
        efficiency REAL NOT NULL,
        adaptability REAL NOT NULL,
        composite REAL NOT NULL,
        risk_level TEXT NOT NULL,
        computed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        state_json TEXT NOT NULL,
        agent_score REAL,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verification_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        confidence REAL NOT NULL,
        suggested_action TEXT NOT NULL,
        flags TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_scores_session ON agent_scores(session_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
      CREATE INDEX IF NOT EXISTS idx_verification_history_session ON verification_history(session_id);
    `);
  }

  // ---------------------------------------------------------------------------
  // Agent scores
  // ---------------------------------------------------------------------------

  insertAgentScore(sessionId: string, agentId: string, score: AgentScore): void {
    const id = randomUUID();
    const computedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO agent_scores (
        id, session_id, agent_id, accuracy, reliability, consistency,
        efficiency, adaptability, composite, risk_level, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sessionId,
      agentId,
      score.accuracy,
      score.reliability,
      score.consistency,
      score.efficiency,
      score.adaptability,
      score.composite,
      score.riskLevel,
      computedAt,
    );
  }

  getAgentScores(sessionId: string, agentId?: string): AgentScoreRow[] {
    const query = agentId !== undefined
      ? "SELECT * FROM agent_scores WHERE session_id = ? AND agent_id = ? ORDER BY computed_at ASC"
      : "SELECT * FROM agent_scores WHERE session_id = ? ORDER BY computed_at ASC";

    const rows = agentId !== undefined
      ? this.db.prepare(query).all(sessionId, agentId) as Array<{
          id: string;
          session_id: string;
          agent_id: string;
          accuracy: number;
          reliability: number;
          consistency: number;
          efficiency: number;
          adaptability: number;
          composite: number;
          risk_level: string;
          computed_at: string;
        }>
      : this.db.prepare(query).all(sessionId) as Array<{
          id: string;
          session_id: string;
          agent_id: string;
          accuracy: number;
          reliability: number;
          consistency: number;
          efficiency: number;
          adaptability: number;
          composite: number;
          risk_level: string;
          computed_at: string;
        }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      accuracy: row.accuracy,
      reliability: row.reliability,
      consistency: row.consistency,
      efficiency: row.efficiency,
      adaptability: row.adaptability,
      composite: row.composite,
      riskLevel: row.risk_level,
      computedAt: row.computed_at,
    }));
  }

  // ---------------------------------------------------------------------------
  // Checkpoints
  // ---------------------------------------------------------------------------

  insertCheckpoint(params: {
    readonly sessionId: string;
    readonly name: string;
    readonly stateJson: string;
    readonly agentScore: number | null;
  }): Checkpoint {
    const checkpointId = randomUUID();
    const createdAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO checkpoints (
        checkpoint_id, session_id, name, state_json, agent_score, verified, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      checkpointId,
      params.sessionId,
      params.name,
      params.stateJson,
      params.agentScore,
      createdAt,
    );

    return {
      checkpointId,
      sessionId: params.sessionId,
      name: params.name,
      stateJson: params.stateJson,
      agentScore: params.agentScore,
      verified: false,
      createdAt,
    };
  }

  getCheckpoint(checkpointId: string): Checkpoint | null {
    const row = this.db.prepare(
      "SELECT * FROM checkpoints WHERE checkpoint_id = ?",
    ).get(checkpointId) as {
      checkpoint_id: string;
      session_id: string;
      name: string;
      state_json: string;
      agent_score: number | null;
      verified: number;
      created_at: string;
    } | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      checkpointId: row.checkpoint_id,
      sessionId: row.session_id,
      name: row.name,
      stateJson: row.state_json,
      agentScore: row.agent_score,
      verified: row.verified === 1,
      createdAt: row.created_at,
    };
  }

  listCheckpoints(sessionId: string): Checkpoint[] {
    const rows = this.db.prepare(
      "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at ASC",
    ).all(sessionId) as Array<{
      checkpoint_id: string;
      session_id: string;
      name: string;
      state_json: string;
      agent_score: number | null;
      verified: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      checkpointId: row.checkpoint_id,
      sessionId: row.session_id,
      name: row.name,
      stateJson: row.state_json,
      agentScore: row.agent_score,
      verified: row.verified === 1,
      createdAt: row.created_at,
    }));
  }

  markVerified(checkpointId: string): void {
    this.db.prepare(
      "UPDATE checkpoints SET verified = 1 WHERE checkpoint_id = ?",
    ).run(checkpointId);
  }

  getLastVerifiedCheckpoint(sessionId: string): Checkpoint | null {
    const row = this.db.prepare(
      "SELECT * FROM checkpoints WHERE session_id = ? AND verified = 1 ORDER BY rowid DESC LIMIT 1",
    ).get(sessionId) as {
      checkpoint_id: string;
      session_id: string;
      name: string;
      state_json: string;
      agent_score: number | null;
      verified: number;
      created_at: string;
    } | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      checkpointId: row.checkpoint_id,
      sessionId: row.session_id,
      name: row.name,
      stateJson: row.state_json,
      agentScore: row.agent_score,
      verified: row.verified === 1,
      createdAt: row.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Verification history
  // ---------------------------------------------------------------------------

  insertVerificationRecord(sessionId: string, assessment: TruthAssessment): void {
    const id = randomUUID();
    const verifiedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO verification_history (
        id, session_id, confidence, suggested_action, flags, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sessionId,
      assessment.confidence,
      assessment.suggestedAction,
      JSON.stringify(assessment.flags),
      verifiedAt,
    );
  }

  getVerificationHistory(sessionId: string): VerificationRow[] {
    const rows = this.db.prepare(
      "SELECT * FROM verification_history WHERE session_id = ? ORDER BY verified_at ASC",
    ).all(sessionId) as Array<{
      id: string;
      session_id: string;
      confidence: number;
      suggested_action: string;
      flags: string;
      verified_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      confidence: row.confidence,
      suggestedAction: row.suggested_action,
      flags: JSON.parse(row.flags) as string[],
      verifiedAt: row.verified_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

import Database from "better-sqlite3";
import type { DriftFinding } from "@eagles-advanced/shared-utils";

export class DriftStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requirements (
        requirements_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        requirements_text TEXT NOT NULL,
        checklist_items TEXT NOT NULL,
        planned_files TEXT NOT NULL,
        initial_test_count INTEGER,
        token_budget INTEGER,
        threshold_warning REAL NOT NULL DEFAULT 0.6,
        threshold_block REAL NOT NULL DEFAULT 0.4,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        wave_number INTEGER NOT NULL,
        files_modified TEXT NOT NULL,
        tests_total INTEGER NOT NULL,
        tests_passing INTEGER NOT NULL,
        requirements_addressed TEXT NOT NULL,
        tokens_consumed INTEGER,
        lines_added INTEGER,
        new_files_created TEXT NOT NULL,
        notes TEXT,
        cumulative_files TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        UNIQUE(session_id, wave_number)
      );

      CREATE TABLE IF NOT EXISTS drift_scores (
        score_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        wave_number INTEGER NOT NULL,
        drift_score REAL NOT NULL,
        requirement_coverage REAL NOT NULL,
        test_health REAL NOT NULL,
        file_churn REAL NOT NULL,
        token_efficiency REAL,
        scope_creep REAL NOT NULL,
        computed_at TEXT NOT NULL,
        UNIQUE(session_id, wave_number)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        alert_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        wave_number INTEGER NOT NULL,
        alert_level TEXT NOT NULL,
        drift_score REAL NOT NULL,
        message TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        triggered_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
      CREATE INDEX IF NOT EXISTS idx_drift_scores_session ON drift_scores(session_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id);
    `);
  }

  getScoresForSession(sessionId: string): DriftFinding[] {
    const rows = this.db.prepare(
      "SELECT * FROM drift_scores WHERE session_id = ? ORDER BY wave_number ASC",
    ).all(sessionId) as Array<{
      session_id: string;
      wave_number: number;
      drift_score: number;
      requirement_coverage: number;
      test_health: number;
      file_churn: number;
      token_efficiency: number | null;
      scope_creep: number;
      computed_at: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      waveNumber: row.wave_number,
      driftScore: row.drift_score,
      alertLevel: row.drift_score >= 0.6 ? "NONE" as const
        : row.drift_score >= 0.4 ? "WARNING" as const
        : "BLOCK" as const,
      metrics: {
        requirementCoverage: row.requirement_coverage,
        testHealth: row.test_health,
        fileChurn: row.file_churn,
        tokenEfficiency: row.token_efficiency,
        scopeCreep: row.scope_creep,
      },
      computedAt: row.computed_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

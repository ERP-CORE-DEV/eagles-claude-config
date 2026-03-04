import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { DriftFinding } from "@eagles-ai-platform/shared-utils";

// ---------------------------------------------------------------------------
// Parameter shapes for DriftStore write methods
// ---------------------------------------------------------------------------

export interface InsertRequirementsParams {
  readonly sessionId: string;
  readonly title: string;
  readonly requirementsText: string;
  readonly checklistItems: string[];
  readonly plannedFiles: string[];
  readonly initialTestCount?: number;
  readonly tokenBudget?: number;
  readonly thresholdWarning?: number;
  readonly thresholdBlock?: number;
}

export interface RequirementsRow {
  readonly requirementsId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly requirementsText: string;
  readonly checklistItems: string[];
  readonly plannedFiles: string[];
  readonly initialTestCount: number | null;
  readonly tokenBudget: number | null;
  readonly thresholdWarning: number;
  readonly thresholdBlock: number;
  readonly createdAt: string;
}

export interface InsertCheckpointParams {
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly filesModified: string[];
  readonly testsTotal: number;
  readonly testsPassing: number;
  readonly requirementsAddressed: string[];
  readonly tokensConsumed?: number;
  readonly linesAdded?: number;
  readonly newFilesCreated: string[];
  readonly notes?: string;
  readonly cumulativeFiles: string[];
}

export interface CheckpointRow {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly filesModified: string[];
  readonly testsTotal: number;
  readonly testsPassing: number;
  readonly requirementsAddressed: string[];
  readonly tokensConsumed: number | null;
  readonly linesAdded: number | null;
  readonly newFilesCreated: string[];
  readonly notes: string | null;
  readonly cumulativeFiles: string[];
  readonly snapshotAt: string;
}

export interface InsertDriftScoreParams {
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly driftScore: number;
  readonly requirementCoverage: number;
  readonly testHealth: number;
  readonly fileChurn: number;
  readonly tokenEfficiency: number | null;
  readonly scopeCreep: number;
}

export interface InsertAlertParams {
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly alertLevel: string;
  readonly driftScore: number;
  readonly message: string;
  readonly recommendedAction: string;
}

export interface AlertRow {
  readonly alertId: string;
  readonly sessionId: string;
  readonly waveNumber: number;
  readonly alertLevel: string;
  readonly driftScore: number;
  readonly message: string;
  readonly recommendedAction: string;
  readonly triggeredAt: string;
}

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

  // -------------------------------------------------------------------------
  // Write methods
  // -------------------------------------------------------------------------

  insertRequirements(params: InsertRequirementsParams): RequirementsRow {
    const requirementsId = randomUUID();
    const createdAt = new Date().toISOString();
    const thresholdWarning = params.thresholdWarning ?? 0.6;
    const thresholdBlock = params.thresholdBlock ?? 0.4;

    this.db.prepare(`
      INSERT OR REPLACE INTO requirements (
        requirements_id, session_id, title, requirements_text,
        checklist_items, planned_files, initial_test_count, token_budget,
        threshold_warning, threshold_block, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      requirementsId,
      params.sessionId,
      params.title,
      params.requirementsText,
      JSON.stringify(params.checklistItems),
      JSON.stringify(params.plannedFiles),
      params.initialTestCount ?? null,
      params.tokenBudget ?? null,
      thresholdWarning,
      thresholdBlock,
      createdAt,
    );

    return {
      requirementsId,
      sessionId: params.sessionId,
      title: params.title,
      requirementsText: params.requirementsText,
      checklistItems: params.checklistItems,
      plannedFiles: params.plannedFiles,
      initialTestCount: params.initialTestCount ?? null,
      tokenBudget: params.tokenBudget ?? null,
      thresholdWarning,
      thresholdBlock,
      createdAt,
    };
  }

  getRequirements(sessionId: string): RequirementsRow | null {
    const row = this.db.prepare(
      "SELECT * FROM requirements WHERE session_id = ?",
    ).get(sessionId) as {
      requirements_id: string;
      session_id: string;
      title: string;
      requirements_text: string;
      checklist_items: string;
      planned_files: string;
      initial_test_count: number | null;
      token_budget: number | null;
      threshold_warning: number;
      threshold_block: number;
      created_at: string;
    } | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      requirementsId: row.requirements_id,
      sessionId: row.session_id,
      title: row.title,
      requirementsText: row.requirements_text,
      checklistItems: JSON.parse(row.checklist_items) as string[],
      plannedFiles: JSON.parse(row.planned_files) as string[],
      initialTestCount: row.initial_test_count,
      tokenBudget: row.token_budget,
      thresholdWarning: row.threshold_warning,
      thresholdBlock: row.threshold_block,
      createdAt: row.created_at,
    };
  }

  insertCheckpoint(params: InsertCheckpointParams): CheckpointRow {
    const checkpointId = randomUUID();
    const snapshotAt = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (
        checkpoint_id, session_id, wave_number, files_modified,
        tests_total, tests_passing, requirements_addressed,
        tokens_consumed, lines_added, new_files_created, notes,
        cumulative_files, snapshot_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkpointId,
      params.sessionId,
      params.waveNumber,
      JSON.stringify(params.filesModified),
      params.testsTotal,
      params.testsPassing,
      JSON.stringify(params.requirementsAddressed),
      params.tokensConsumed ?? null,
      params.linesAdded ?? null,
      JSON.stringify(params.newFilesCreated),
      params.notes ?? null,
      JSON.stringify(params.cumulativeFiles),
      snapshotAt,
    );

    return {
      checkpointId,
      sessionId: params.sessionId,
      waveNumber: params.waveNumber,
      filesModified: params.filesModified,
      testsTotal: params.testsTotal,
      testsPassing: params.testsPassing,
      requirementsAddressed: params.requirementsAddressed,
      tokensConsumed: params.tokensConsumed ?? null,
      linesAdded: params.linesAdded ?? null,
      newFilesCreated: params.newFilesCreated,
      notes: params.notes ?? null,
      cumulativeFiles: params.cumulativeFiles,
      snapshotAt,
    };
  }

  getCheckpoints(sessionId: string): CheckpointRow[] {
    const rows = this.db.prepare(
      "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY wave_number ASC",
    ).all(sessionId) as Array<{
      checkpoint_id: string;
      session_id: string;
      wave_number: number;
      files_modified: string;
      tests_total: number;
      tests_passing: number;
      requirements_addressed: string;
      tokens_consumed: number | null;
      lines_added: number | null;
      new_files_created: string;
      notes: string | null;
      cumulative_files: string;
      snapshot_at: string;
    }>;

    return rows.map((row) => ({
      checkpointId: row.checkpoint_id,
      sessionId: row.session_id,
      waveNumber: row.wave_number,
      filesModified: JSON.parse(row.files_modified) as string[],
      testsTotal: row.tests_total,
      testsPassing: row.tests_passing,
      requirementsAddressed: JSON.parse(row.requirements_addressed) as string[],
      tokensConsumed: row.tokens_consumed,
      linesAdded: row.lines_added,
      newFilesCreated: JSON.parse(row.new_files_created) as string[],
      notes: row.notes,
      cumulativeFiles: JSON.parse(row.cumulative_files) as string[],
      snapshotAt: row.snapshot_at,
    }));
  }

  insertDriftScore(params: InsertDriftScoreParams): void {
    const scoreId = randomUUID();
    const computedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO drift_scores (
        score_id, session_id, wave_number, drift_score,
        requirement_coverage, test_health, file_churn,
        token_efficiency, scope_creep, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scoreId,
      params.sessionId,
      params.waveNumber,
      params.driftScore,
      params.requirementCoverage,
      params.testHealth,
      params.fileChurn,
      params.tokenEfficiency ?? null,
      params.scopeCreep,
      computedAt,
    );
  }

  insertAlert(params: InsertAlertParams): AlertRow {
    const alertId = randomUUID();
    const triggeredAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO alerts (
        alert_id, session_id, wave_number, alert_level,
        drift_score, message, recommended_action, triggered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      params.sessionId,
      params.waveNumber,
      params.alertLevel,
      params.driftScore,
      params.message,
      params.recommendedAction,
      triggeredAt,
    );

    return {
      alertId,
      sessionId: params.sessionId,
      waveNumber: params.waveNumber,
      alertLevel: params.alertLevel,
      driftScore: params.driftScore,
      message: params.message,
      recommendedAction: params.recommendedAction,
      triggeredAt,
    };
  }

  deleteSession(sessionId: string): {
    requirements: number;
    checkpoints: number;
    driftScores: number;
    alerts: number;
  } {
    const reqCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM requirements WHERE session_id = ?",
    ).get(sessionId) as { n: number }).n;
    const cpCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM checkpoints WHERE session_id = ?",
    ).get(sessionId) as { n: number }).n;
    const dsCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM drift_scores WHERE session_id = ?",
    ).get(sessionId) as { n: number }).n;
    const alCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM alerts WHERE session_id = ?",
    ).get(sessionId) as { n: number }).n;

    this.db.prepare("DELETE FROM requirements WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM checkpoints WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM drift_scores WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM alerts WHERE session_id = ?").run(sessionId);

    return {
      requirements: reqCount,
      checkpoints: cpCount,
      driftScores: dsCount,
      alerts: alCount,
    };
  }

  getAlertsForSession(sessionId: string): AlertRow[] {
    const rows = this.db.prepare(
      "SELECT * FROM alerts WHERE session_id = ? ORDER BY wave_number ASC",
    ).all(sessionId) as Array<{
      alert_id: string;
      session_id: string;
      wave_number: number;
      alert_level: string;
      drift_score: number;
      message: string;
      recommended_action: string;
      triggered_at: string;
    }>;

    return rows.map((row) => ({
      alertId: row.alert_id,
      sessionId: row.session_id,
      waveNumber: row.wave_number,
      alertLevel: row.alert_level,
      driftScore: row.drift_score,
      message: row.message,
      recommendedAction: row.recommended_action,
      triggeredAt: row.triggered_at,
    }));
  }

  // -------------------------------------------------------------------------
  // Read methods (existing)
  // -------------------------------------------------------------------------

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

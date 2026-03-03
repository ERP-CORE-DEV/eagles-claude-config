import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface ToolMetricRecord {
  readonly id: string;
  readonly toolName: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly serverName: string;
  readonly recordedAt: string;
}

export interface ToolPercentiles {
  readonly toolName: string;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly count: number;
  readonly avgMs: number;
  readonly successRate: number;
}

export interface SlowestTool {
  readonly toolName: string;
  readonly avgMs: number;
  readonly maxMs: number;
  readonly count: number;
}

interface RawMetricRow {
  readonly id: string;
  readonly tool_name: string;
  readonly duration_ms: number;
  readonly success: number;
  readonly server_name: string;
  readonly recorded_at: string;
}

interface CountRow {
  readonly count: number;
}

export class ToolMetricsStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_metrics (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        server_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_metrics_name ON tool_metrics(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_metrics_recorded ON tool_metrics(recorded_at);
    `);
  }

  record(params: {
    readonly toolName: string;
    readonly durationMs: number;
    readonly success: boolean;
    readonly serverName: string;
  }): ToolMetricRecord {
    const id = randomUUID();
    const recordedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO tool_metrics (id, tool_name, duration_ms, success, server_name, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.toolName, params.durationMs, params.success ? 1 : 0, params.serverName, recordedAt);

    return {
      id,
      toolName: params.toolName,
      durationMs: params.durationMs,
      success: params.success,
      serverName: params.serverName,
      recordedAt,
    };
  }

  getPercentiles(toolName: string, windowDays?: number): ToolPercentiles | null {
    const conditions: string[] = ["tool_name = ?"];
    const bindings: unknown[] = [toolName];

    if (windowDays !== undefined) {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString();
      conditions.push("recorded_at >= ?");
      bindings.push(since);
    }

    const whereClause = conditions.join(" AND ");

    const rows = this.db.prepare(
      `SELECT duration_ms FROM tool_metrics WHERE ${whereClause} ORDER BY duration_ms ASC`,
    ).all(...bindings) as Array<{ duration_ms: number }>;

    if (rows.length === 0) return null;

    const durations = rows.map((r) => r.duration_ms);
    const count = durations.length;

    const successRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM tool_metrics WHERE ${whereClause} AND success = 1`,
    ).get(...bindings) as CountRow;

    const avgMs = durations.reduce((sum, d) => sum + d, 0) / count;

    return {
      toolName,
      p50: nearestRank(durations, 0.50),
      p95: nearestRank(durations, 0.95),
      p99: nearestRank(durations, 0.99),
      count,
      avgMs: Math.round(avgMs * 100) / 100,
      successRate: count > 0 ? successRow.count / count : 0,
    };
  }

  getTopSlowest(limit: number = 10, windowDays?: number): SlowestTool[] {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (windowDays !== undefined) {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString();
      conditions.push("recorded_at >= ?");
      bindings.push(since);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = this.db.prepare(`
      SELECT tool_name, AVG(duration_ms) as avg_ms, MAX(duration_ms) as max_ms, COUNT(*) as count
      FROM tool_metrics ${whereClause}
      GROUP BY tool_name
      ORDER BY avg_ms DESC
      LIMIT ?
    `).all(...bindings, limit) as Array<{
      tool_name: string;
      avg_ms: number;
      max_ms: number;
      count: number;
    }>;

    return rows.map((row) => ({
      toolName: row.tool_name,
      avgMs: Math.round(row.avg_ms * 100) / 100,
      maxMs: row.max_ms,
      count: row.count,
    }));
  }

  getAllToolNames(): string[] {
    const rows = this.db.prepare(
      "SELECT DISTINCT tool_name FROM tool_metrics ORDER BY tool_name",
    ).all() as Array<{ tool_name: string }>;
    return rows.map((r) => r.tool_name);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM tool_metrics").get() as CountRow;
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}

function nearestRank(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

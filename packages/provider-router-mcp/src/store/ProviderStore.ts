import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface ProviderConfig {
  readonly name: string;
  readonly endpoint: string;
  readonly apiKeyEnvVar: string;
  readonly models: string[];
}

export interface RoutingRecord {
  readonly provider: string;
  readonly model: string;
  readonly strategy: string;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface RoutingStats {
  readonly totalRequests: number;
  readonly totalCostUsd: number;
  readonly byProvider: Record<string, { requests: number; costUsd: number }>;
}

export class ProviderStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        name TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        api_key_env_var TEXT NOT NULL,
        models TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS routing_history (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        strategy TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        success INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_routing_history_provider ON routing_history(provider);
      CREATE INDEX IF NOT EXISTS idx_routing_history_recorded_at ON routing_history(recorded_at);
    `);
  }

  saveProviderConfig(config: ProviderConfig): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO provider_configs (name, endpoint, api_key_env_var, models, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        endpoint = excluded.endpoint,
        api_key_env_var = excluded.api_key_env_var,
        models = excluded.models,
        updated_at = excluded.updated_at
    `).run(
      config.name,
      config.endpoint,
      config.apiKeyEnvVar,
      JSON.stringify(config.models),
      now,
      now,
    );
  }

  getProviderConfig(name: string): ProviderConfig | null {
    const row = this.db.prepare(
      "SELECT name, endpoint, api_key_env_var, models FROM provider_configs WHERE name = ?",
    ).get(name) as {
      name: string;
      endpoint: string;
      api_key_env_var: string;
      models: string;
    } | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      name: row.name,
      endpoint: row.endpoint,
      apiKeyEnvVar: row.api_key_env_var,
      models: JSON.parse(row.models) as string[],
    };
  }

  listProviderConfigs(): ProviderConfig[] {
    const rows = this.db.prepare(
      "SELECT name, endpoint, api_key_env_var, models FROM provider_configs ORDER BY name ASC",
    ).all() as Array<{
      name: string;
      endpoint: string;
      api_key_env_var: string;
      models: string;
    }>;

    return rows.map((row) => ({
      name: row.name,
      endpoint: row.endpoint,
      apiKeyEnvVar: row.api_key_env_var,
      models: JSON.parse(row.models) as string[],
    }));
  }

  removeProviderConfig(name: string): boolean {
    const result = this.db.prepare(
      "DELETE FROM provider_configs WHERE name = ?",
    ).run(name);
    return result.changes > 0;
  }

  recordRouting(params: RoutingRecord): void {
    const id = randomUUID();
    const recordedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO routing_history (id, provider, model, strategy, cost_usd, duration_ms, success, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.provider,
      params.model,
      params.strategy,
      params.costUsd,
      params.durationMs,
      params.success ? 1 : 0,
      recordedAt,
    );
  }

  getRoutingStats(windowDays = 30): RoutingStats {
    const since = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const totalsRow = this.db.prepare(`
      SELECT COUNT(*) as total_requests, COALESCE(SUM(cost_usd), 0) as total_cost_usd
      FROM routing_history
      WHERE recorded_at >= ?
    `).get(since) as { total_requests: number; total_cost_usd: number };

    const byProviderRows = this.db.prepare(`
      SELECT provider, COUNT(*) as requests, COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM routing_history
      WHERE recorded_at >= ?
      GROUP BY provider
    `).all(since) as Array<{ provider: string; requests: number; cost_usd: number }>;

    const byProvider: Record<string, { requests: number; costUsd: number }> = {};
    for (const row of byProviderRows) {
      byProvider[row.provider] = {
        requests: row.requests,
        costUsd: row.cost_usd,
      };
    }

    return {
      totalRequests: totalsRow.total_requests,
      totalCostUsd: totalsRow.total_cost_usd,
      byProvider,
    };
  }

  close(): void {
    this.db.close();
  }
}

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { TokenRecord } from "@eagles-advanced/shared-utils";
import { MODEL_PRICING, CACHE_DISCOUNT } from "@eagles-advanced/shared-utils";

export class TokenLedger {
  private readonly db: Database.Database;

  constructor(ledgerPath: string) {
    this.db = new Database(ledgerPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_records (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        wave_number INTEGER,
        agent_name TEXT,
        tool_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_token_session ON token_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_token_recorded ON token_records(recorded_at);
    `);
  }

  insert(params: Omit<TokenRecord, "id" | "estimatedCostUsd" | "recordedAt" | "totalTokens">): TokenRecord {
    const id = randomUUID();
    const totalTokens = params.promptTokens + params.completionTokens;
    const estimatedCostUsd = this.calculateCost(
      params.modelName,
      params.promptTokens,
      params.completionTokens,
      params.cacheReadTokens,
      params.cacheWriteTokens,
    );
    const recordedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO token_records (id, session_id, model_name, prompt_tokens, completion_tokens,
        total_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, recorded_at,
        wave_number, agent_name, tool_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, params.sessionId, params.modelName, params.promptTokens,
      params.completionTokens, totalTokens, params.cacheReadTokens,
      params.cacheWriteTokens, estimatedCostUsd, recordedAt,
      params.waveNumber, params.agentName, params.toolName,
    );

    return {
      id, sessionId: params.sessionId, modelName: params.modelName,
      promptTokens: params.promptTokens, completionTokens: params.completionTokens,
      totalTokens, cacheReadTokens: params.cacheReadTokens,
      cacheWriteTokens: params.cacheWriteTokens, estimatedCostUsd,
      recordedAt, waveNumber: params.waveNumber, agentName: params.agentName,
      toolName: params.toolName,
    };
  }

  sumCost(windowDays: number): number {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM token_records WHERE recorded_at >= ?",
    ).get(since) as { total: number };
    return row.total;
  }

  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number,
  ): number {
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
    if (!pricing) return 0;

    const regularInput = inputTokens - cacheReadTokens - cacheWriteTokens;
    const inputCost = (Math.max(0, regularInput) / 1_000_000) * pricing.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.inputPer1M * CACHE_DISCOUNT.READ_MULTIPLIER;
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.inputPer1M * CACHE_DISCOUNT.CREATE_MULTIPLIER;

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  close(): void {
    this.db.close();
  }
}

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

  getSessionCost(sessionId: string): {
    totalCost: number;
    records: number;
    byModel: Record<string, { tokens: number; cost: number }>;
  } {
    const totalsRow = this.db.prepare(
      "SELECT COALESCE(SUM(estimated_cost_usd), 0) as totalCost, COUNT(*) as records FROM token_records WHERE session_id = ?",
    ).get(sessionId) as { totalCost: number; records: number };

    const modelRows = this.db.prepare(
      "SELECT model_name, SUM(total_tokens) as tokens, SUM(estimated_cost_usd) as cost FROM token_records WHERE session_id = ? GROUP BY model_name",
    ).all(sessionId) as Array<{ model_name: string; tokens: number; cost: number }>;

    const byModel: Record<string, { tokens: number; cost: number }> = {};
    for (const row of modelRows) {
      byModel[row.model_name] = { tokens: row.tokens, cost: row.cost };
    }

    return { totalCost: totalsRow.totalCost, records: totalsRow.records, byModel };
  }

  getAgentCosts(sessionId: string): Array<{
    agentName: string;
    totalCost: number;
    totalTokens: number;
  }> {
    const rows = this.db.prepare(
      `SELECT agent_name, SUM(estimated_cost_usd) as totalCost, SUM(total_tokens) as totalTokens
       FROM token_records
       WHERE session_id = ? AND agent_name IS NOT NULL
       GROUP BY agent_name
       ORDER BY totalCost DESC`,
    ).all(sessionId) as Array<{ agent_name: string; totalCost: number; totalTokens: number }>;

    return rows.map((row) => ({
      agentName: row.agent_name,
      totalCost: row.totalCost,
      totalTokens: row.totalTokens,
    }));
  }

  getWaveCosts(sessionId: string): Array<{
    waveNumber: number;
    totalCost: number;
    totalTokens: number;
  }> {
    const rows = this.db.prepare(
      `SELECT wave_number, SUM(estimated_cost_usd) as totalCost, SUM(total_tokens) as totalTokens
       FROM token_records
       WHERE session_id = ? AND wave_number IS NOT NULL
       GROUP BY wave_number
       ORDER BY wave_number ASC`,
    ).all(sessionId) as Array<{ wave_number: number; totalCost: number; totalTokens: number }>;

    return rows.map((row) => ({
      waveNumber: row.wave_number,
      totalCost: row.totalCost,
      totalTokens: row.totalTokens,
    }));
  }

  getCostReport(windowDays: number): {
    totalCost: number;
    byModel: Record<string, number>;
    byDay: Array<{ date: string; cost: number }>;
    recordCount: number;
  } {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    const totalsRow = this.db.prepare(
      "SELECT COALESCE(SUM(estimated_cost_usd), 0) as totalCost, COUNT(*) as recordCount FROM token_records WHERE recorded_at >= ?",
    ).get(since) as { totalCost: number; recordCount: number };

    const modelRows = this.db.prepare(
      "SELECT model_name, SUM(estimated_cost_usd) as cost FROM token_records WHERE recorded_at >= ? GROUP BY model_name",
    ).all(since) as Array<{ model_name: string; cost: number }>;

    const byModel: Record<string, number> = {};
    for (const row of modelRows) {
      byModel[row.model_name] = row.cost;
    }

    const dayRows = this.db.prepare(
      `SELECT substr(recorded_at, 1, 10) as date, SUM(estimated_cost_usd) as cost
       FROM token_records
       WHERE recorded_at >= ?
       GROUP BY substr(recorded_at, 1, 10)
       ORDER BY date ASC`,
    ).all(since) as Array<{ date: string; cost: number }>;

    return {
      totalCost: totalsRow.totalCost,
      byModel,
      byDay: dayRows,
      recordCount: totalsRow.recordCount,
    };
  }

  generateAdvisory(windowDays: number): string[] {
    const advisories: string[] = [];
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    const totals = this.db.prepare(
      `SELECT COALESCE(SUM(prompt_tokens), 0) as totalInput,
              COALESCE(SUM(completion_tokens), 0) as totalOutput,
              COALESCE(SUM(estimated_cost_usd), 0) as totalCost,
              COUNT(*) as recordCount
       FROM token_records WHERE recorded_at >= ?`,
    ).get(since) as { totalInput: number; totalOutput: number; totalCost: number; recordCount: number };

    const totalTokens = totals.totalInput + totals.totalOutput;

    if (totalTokens > 0 && totals.totalOutput / totalTokens > 0.6) {
      const pct = Math.round((totals.totalOutput / totalTokens) * 100);
      advisories.push(
        `High output ratio (${pct}%). Consider more concise system prompts to reduce output tokens.`,
      );
    }

    const topModel = this.db.prepare(
      `SELECT model_name, SUM(estimated_cost_usd) as cost
       FROM token_records WHERE recorded_at >= ?
       GROUP BY model_name ORDER BY cost DESC LIMIT 1`,
    ).get(since) as { model_name: string; cost: number } | undefined;

    if (topModel && totals.totalCost > 0 && topModel.cost / totals.totalCost > 0.5) {
      const pct = Math.round((topModel.cost / totals.totalCost) * 100);
      advisories.push(
        `${topModel.model_name} accounts for ${pct}% of spend ($${topModel.cost.toFixed(4)}). Route non-critical tasks to cheaper models.`,
      );
    }

    const topAgent = this.db.prepare(
      `SELECT agent_name, SUM(total_tokens) as tokens
       FROM token_records WHERE recorded_at >= ? AND agent_name IS NOT NULL
       GROUP BY agent_name ORDER BY tokens DESC LIMIT 1`,
    ).get(since) as { agent_name: string; tokens: number } | undefined;

    if (topAgent && totalTokens > 0 && topAgent.tokens / totalTokens > 0.5) {
      const pct = Math.round((topAgent.tokens / totalTokens) * 100);
      advisories.push(
        `Agent "${topAgent.agent_name}" consumes ${pct}% of tokens. Optimize its prompts or add caching.`,
      );
    }

    if (totals.recordCount > 500) {
      advisories.push(
        `High request volume (${totals.recordCount} calls in ${windowDays}d). Evaluate cache-read tokens to reduce costs.`,
      );
    }

    const warnThreshold = 5.0;
    if (totals.totalCost > warnThreshold * 0.8) {
      advisories.push(
        `Approaching WARN threshold ($${totals.totalCost.toFixed(2)}/$${warnThreshold.toFixed(2)}). Review model routing.`,
      );
    }

    return advisories;
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

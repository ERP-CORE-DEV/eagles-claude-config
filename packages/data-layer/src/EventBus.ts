import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type EventTopic =
  | "token.recorded"
  | "drift.detected"
  | "budget.alert"
  | "memory.stored";

export interface BusEvent<T = unknown> {
  readonly id: string;
  readonly topic: EventTopic;
  readonly publishedAt: string;
  readonly payload: T;
}

export class EventBus {
  private readonly db: Database.Database;
  private readonly maxEvents: number | null;
  private publishCount = 0;
  private readonly cleanupInterval = 100;

  constructor(busPath: string, maxEvents?: number) {
    this.db = new Database(busPath);
    this.maxEvents = maxEvents ?? null;
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        published_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_topic
        ON events(topic, published_at);
    `);
  }

  publish<T>(topic: EventTopic, payload: T): string {
    const id = randomUUID();
    const stmt = this.db.prepare(
      "INSERT INTO events (id, topic, published_at, payload) VALUES (?, ?, ?, ?)",
    );
    stmt.run(id, topic, new Date().toISOString(), JSON.stringify(payload));

    // Lazy cleanup: check maxEvents every N publishes
    this.publishCount++;
    if (this.maxEvents !== null && this.publishCount % this.cleanupInterval === 0) {
      this.enforceMaxEvents();
    }

    return id;
  }

  /** Force enforcement of the maxEvents cap (called lazily by publish). */
  enforceMaxEvents(): void {
    if (this.maxEvents === null) return;
    const countRow = this.db.prepare("SELECT COUNT(*) as n FROM events").get() as { n: number };
    if (countRow.n > this.maxEvents) {
      const excess = countRow.n - this.maxEvents;
      this.db.prepare(
        "DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY rowid ASC LIMIT ?)",
      ).run(excess);
    }
  }

  consume<T>(
    topic: EventTopic,
    afterId: string | null,
    limit: number = 100,
  ): BusEvent<T>[] {
    const query = afterId
      ? this.db.prepare(
          "SELECT * FROM events WHERE topic = ? AND rowid > (SELECT rowid FROM events WHERE id = ?) ORDER BY rowid ASC LIMIT ?",
        )
      : this.db.prepare(
          "SELECT * FROM events WHERE topic = ? ORDER BY rowid ASC LIMIT ?",
        );

    const rows = afterId
      ? (query.all(topic, afterId, limit) as Array<{
          id: string;
          topic: string;
          published_at: string;
          payload: string;
        }>)
      : (query.all(topic, limit) as Array<{
          id: string;
          topic: string;
          published_at: string;
          payload: string;
        }>);

    return rows.map((row) => ({
      id: row.id,
      topic: row.topic as EventTopic,
      publishedAt: row.published_at,
      payload: JSON.parse(row.payload) as T,
    }));
  }

  async waitFor<T>(
    topic: EventTopic,
    timeoutMs: number = 5000,
    pollMs: number = 50,
  ): Promise<BusEvent<T>> {
    const deadline = Date.now() + timeoutMs;
    let lastId: string | null = null;
    while (Date.now() < deadline) {
      const events = this.consume<T>(topic, lastId, 1);
      if (events.length > 0) return events[0]!;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error(`Timeout waiting for event on topic: ${topic}`);
  }

  consumeFiltered<T>(
    topic: EventTopic,
    afterId: string | null,
    predicate: (payload: T) => boolean,
    limit: number = 100,
  ): BusEvent<T>[] {
    const candidates = this.consume<T>(topic, afterId, limit * 2);
    return candidates.filter((e) => predicate(e.payload)).slice(0, limit);
  }

  cleanOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = this.db.prepare(
      "DELETE FROM events WHERE published_at < ?",
    ).run(cutoff);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

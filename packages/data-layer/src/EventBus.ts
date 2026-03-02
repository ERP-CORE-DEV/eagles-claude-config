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

  constructor(busPath: string) {
    this.db = new Database(busPath);
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
    return id;
  }

  consume<T>(
    topic: EventTopic,
    afterId: string | null,
    limit: number = 100,
  ): BusEvent<T>[] {
    const query = afterId
      ? this.db.prepare(
          "SELECT * FROM events WHERE topic = ? AND published_at > (SELECT published_at FROM events WHERE id = ?) ORDER BY published_at ASC LIMIT ?",
        )
      : this.db.prepare(
          "SELECT * FROM events WHERE topic = ? ORDER BY published_at ASC LIMIT ?",
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

  close(): void {
    this.db.close();
  }
}

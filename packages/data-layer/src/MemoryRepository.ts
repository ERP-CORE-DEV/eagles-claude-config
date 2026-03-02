// MemoryRepository — SQLite-backed metadata store for vector memory entries.
// Stores all VectorEntry fields except the raw vector (stored in VectorStore).
// Uses better-sqlite3 via the data-layer package's bundled dependency.

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { VectorEntry, MemoryTag } from "@eagles-advanced/shared-utils";

type InsertParams = Omit<VectorEntry, "id" | "createdAt" | "accessedAt" | "accessCount">;

interface ListOptions {
  readonly project?: string;
  readonly tags?: string[];
  readonly limit?: number;
  readonly offset?: number;
}

interface StatsResult {
  readonly total: number;
  readonly byProject: Record<string, number>;
  readonly byTag: Record<string, number>;
}

interface RawMemoryRow {
  readonly id: string;
  readonly text: string;
  readonly project: string;
  readonly tags: string;
  readonly confidence: number;
  readonly source: string;
  readonly created_at: string;
  readonly accessed_at: string;
  readonly access_count: number;
}

interface CountRow {
  readonly count: number;
}

interface ProjectRow {
  readonly project: string;
  readonly count: number;
}

export class MemoryRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        project TEXT NOT NULL,
        tags TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `);
  }

  insert(params: InsertParams): VectorEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(params.tags);

    this.db.prepare(`
      INSERT INTO memories (id, text, project, tags, confidence, source, created_at, accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, params.text, params.project, tagsJson, params.confidence, params.source, now, now);

    return {
      id,
      text: params.text,
      project: params.project,
      tags: params.tags,
      confidence: params.confidence,
      source: params.source,
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
    };
  }

  getById(id: string): VectorEntry | null {
    const row = this.db.prepare(
      "SELECT * FROM memories WHERE id = ?",
    ).get(id) as RawMemoryRow | undefined;

    if (row === undefined) return null;
    return this.rowToEntry(row);
  }

  delete(ids: string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(", ");
    const result = this.db.prepare(
      `DELETE FROM memories WHERE id IN (${placeholders})`,
    ).run(...ids) as Database.RunResult;
    return result.changes;
  }

  list(options: ListOptions): VectorEntry[] {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (options.project !== undefined) {
      conditions.push("project = ?");
      bindings.push(options.project);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM memories ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...bindings, limit, offset) as RawMemoryRow[];

    let entries = rows.map((row) => this.rowToEntry(row));

    if (options.tags !== undefined && options.tags.length > 0) {
      const requiredTags = new Set(options.tags);
      entries = entries.filter((entry) =>
        entry.tags.some((tag) => requiredTags.has(tag)),
      );
    }

    return entries;
  }

  updateAccess(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?",
    ).run(now, id);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM memories").get() as CountRow;
    return row.count;
  }

  getStats(): StatsResult {
    const total = this.count();

    const projectRows = this.db.prepare(
      "SELECT project, COUNT(*) as count FROM memories GROUP BY project",
    ).all() as ProjectRow[];

    const byProject: Record<string, number> = {};
    for (const row of projectRows) {
      byProject[row.project] = row.count;
    }

    const allTagRows = this.db.prepare(
      "SELECT tags FROM memories",
    ).all() as Array<{ tags: string }>;

    const byTag: Record<string, number> = {};
    for (const row of allTagRows) {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        byTag[tag] = (byTag[tag] ?? 0) + 1;
      }
    }

    return { total, byProject, byTag };
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: RawMemoryRow): VectorEntry {
    return {
      id: row.id,
      text: row.text,
      project: row.project,
      tags: JSON.parse(row.tags) as MemoryTag[],
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count,
    };
  }
}

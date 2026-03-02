export const MEMORY_TAGS = [
  "lesson",
  "pattern",
  "preference",
  "architecture",
  "decision",
  "bug",
  "performance",
  "security",
  "gdpr",
  "workflow",
] as const;

export type MemoryTag = (typeof MEMORY_TAGS)[number];

export interface VectorEntry {
  readonly id: string;
  readonly text: string;
  readonly project: string;
  readonly tags: readonly MemoryTag[];
  readonly confidence: number;
  readonly source: string;
  readonly createdAt: string;
  readonly accessedAt: string;
  readonly accessCount: number;
}

export interface VectorSearchResult {
  readonly entry: VectorEntry;
  readonly score: number;
}

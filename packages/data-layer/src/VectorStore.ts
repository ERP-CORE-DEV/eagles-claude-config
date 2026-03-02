// VectorStore — HNSWLib wrapper for semantic vector similarity search.
// Persists the index to disk using a WAL-safe write pattern (write .tmp, rename).
// Falls back to brute-force cosine similarity if hnswlib-node native build fails.

import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const INDEX_FILE = "hnsw.index";
const MAX_ELEMENTS_INITIAL = 1000;
const EF_CONSTRUCTION = 200;
const M_CONNECTIONS = 16;

type HierarchicalNSWInstance = {
  initIndex(maxElements: number, efConstruction?: number, M?: number): void;
  readIndex(path: string, allowReplaceDeleted?: boolean): void;
  writeIndex(path: string): void;
  addPoint(point: number[], label: number): void;
  markDelete(label: number): void;
  searchKnn(query: number[], k: number): { distances: number[]; neighbors: number[] };
  getCurrentCount(): number;
  getMaxElements(): number;
  resizeIndex(newSize: number): void;
  getIdsList(): number[];
  getNumDimensions(): number;
};

type HnswlibModule = {
  HierarchicalNSW: new (space: string, dimensions: number) => HierarchicalNSWInstance;
};

interface BruteForceEntry {
  id: string;
  vector: number[];
  deleted: boolean;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export class VectorStore {
  private readonly indexPath: string;
  private initialized = false;
  private dimensions = 384;

  // HNSWLib fields (primary path)
  private hnswIndex: HierarchicalNSWInstance | null = null;
  private hnswAvailable = false;

  // Label mapping: numeric label (required by hnswlib) <-> string id
  private labelToId = new Map<number, string>();
  private idToLabel = new Map<string, number>();
  private nextLabel = 0;
  private deletedLabels = new Set<number>();

  // Fallback brute-force fields
  private bruteForceStore: BruteForceEntry[] = [];

  constructor(dataDir: string) {
    this.indexPath = join(dataDir, INDEX_FILE);
  }

  async init(dimensions = 384): Promise<void> {
    this.dimensions = dimensions;

    try {
      const mod = await import("hnswlib-node") as HnswlibModule;
      this.hnswIndex = new mod.HierarchicalNSW("cosine", this.dimensions);

      if (existsSync(this.indexPath)) {
        this.hnswIndex.readIndex(this.indexPath, true);
        this.nextLabel = this.hnswIndex.getCurrentCount();
      } else {
        this.hnswIndex.initIndex(MAX_ELEMENTS_INITIAL, EF_CONSTRUCTION, M_CONNECTIONS);
      }

      this.hnswAvailable = true;
    } catch (error: unknown) {
      process.stderr.write(
        `[VectorStore] hnswlib-node unavailable, using brute-force fallback: ${String(error)}\n`,
      );
      this.hnswAvailable = false;
    }

    this.initialized = true;
  }

  async upsert(id: string, vector: number[], _metadata: Record<string, unknown>): Promise<void> {
    if (!this.initialized) await this.init(this.dimensions);

    if (this.hnswAvailable && this.hnswIndex !== null) {
      await this.hnswUpsert(id, vector);
    } else {
      this.bruteForceUpsert(id, vector);
    }
  }

  async search(queryVector: number[], topK: number): Promise<Array<{ id: string; score: number }>> {
    if (!this.initialized) await this.init(this.dimensions);

    if (this.hnswAvailable && this.hnswIndex !== null) {
      return this.hnswSearch(queryVector, topK);
    }
    return this.bruteForceSearch(queryVector, topK);
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized) await this.init(this.dimensions);

    if (this.hnswAvailable && this.hnswIndex !== null) {
      const label = this.idToLabel.get(id);
      if (label !== undefined) {
        this.hnswIndex.markDelete(label);
        this.deletedLabels.add(label);
        this.idToLabel.delete(id);
        this.labelToId.delete(label);
      }
    } else {
      const entry = this.bruteForceStore.find((e) => e.id === id);
      if (entry !== undefined) {
        entry.deleted = true;
      }
    }
  }

  async rebuild(): Promise<void> {
    if (!this.initialized) await this.init(this.dimensions);

    if (this.hnswAvailable && this.hnswIndex !== null) {
      await this.hnswRebuild();
    } else {
      this.bruteForceStore = this.bruteForceStore.filter((e) => !e.deleted);
    }
  }

  getCount(): number {
    if (!this.initialized) return 0;

    if (this.hnswAvailable && this.hnswIndex !== null) {
      return this.idToLabel.size;
    }
    return this.bruteForceStore.filter((e) => !e.deleted).length;
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  // ---- HNSW implementation ----

  private async hnswUpsert(id: string, vector: number[]): Promise<void> {
    const index = this.hnswIndex!;

    // If already exists, mark the old label deleted so we can reuse the slot
    const existingLabel = this.idToLabel.get(id);
    if (existingLabel !== undefined) {
      index.markDelete(existingLabel);
      this.deletedLabels.add(existingLabel);
      this.labelToId.delete(existingLabel);
    }

    // Grow the index if needed
    const currentMax = index.getMaxElements();
    if (this.nextLabel >= currentMax) {
      index.resizeIndex(currentMax + MAX_ELEMENTS_INITIAL);
    }

    const label = this.nextLabel++;
    index.addPoint(vector, label);
    this.labelToId.set(label, id);
    this.idToLabel.set(id, label);

    await this.persistIndex();
  }

  private hnswSearch(queryVector: number[], topK: number): Array<{ id: string; score: number }> {
    const index = this.hnswIndex!;
    const activeCount = this.idToLabel.size;
    if (activeCount === 0) return [];

    const k = Math.min(topK, activeCount);
    const result = index.searchKnn(queryVector, k);

    const output: Array<{ id: string; score: number }> = [];
    for (let i = 0; i < result.neighbors.length; i++) {
      const label = result.neighbors[i];
      const distance = result.distances[i];
      if (label === undefined || distance === undefined) continue;

      const id = this.labelToId.get(label);
      if (id === undefined) continue; // deleted entry

      // hnswlib cosine space returns 1-cos(a,b), so similarity = 1 - distance
      output.push({ id, score: 1 - distance });
    }

    return output;
  }

  private async hnswRebuild(): Promise<void> {
    // hnswlib-node's markDelete() physically excludes deleted nodes from future
    // searchKnn results. The in-memory label mapping already reflects deletions
    // (idToLabel / labelToId were cleared in delete()). Labels in the HNSW
    // index must remain stable — we must NOT remap them because searchKnn
    // returns the original label numbers which we use as lookup keys.
    //
    // So rebuild is purely bookkeeping: clear the set of deleted labels
    // and persist the index (which already has markDelete applied).
    this.deletedLabels.clear();
    await this.persistIndex();
  }

  private async persistIndex(): Promise<void> {
    if (this.hnswIndex === null) return;
    const tmpPath = `${this.indexPath}.tmp`;
    this.hnswIndex.writeIndex(tmpPath);
    renameSync(tmpPath, this.indexPath);
  }

  // ---- Brute-force fallback ----

  private bruteForceUpsert(id: string, vector: number[]): void {
    const existing = this.bruteForceStore.find((e) => e.id === id);
    if (existing !== undefined) {
      existing.vector = vector;
      existing.deleted = false;
    } else {
      this.bruteForceStore.push({ id, vector, deleted: false });
    }
  }

  private bruteForceSearch(queryVector: number[], topK: number): Array<{ id: string; score: number }> {
    const active = this.bruteForceStore.filter((e) => !e.deleted);
    const scored = active.map((e) => ({
      id: e.id,
      score: 1 - cosineDistance(queryVector, e.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

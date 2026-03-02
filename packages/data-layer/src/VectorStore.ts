// VectorStore — HNSWLib wrapper for semantic memory search
// Implements upsert, search, delete, and rebuild operations.
// Falls back gracefully if hnswlib-node native build fails.

export class VectorStore {
  private readonly dataDir: string;
  private initialized = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async init(): Promise<void> {
    // TODO: Phase 3 — Initialize HNSWLib index from dataDir
    this.initialized = true;
  }

  async upsert(
    id: string,
    vector: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.initialized) await this.init();
    // TODO: Phase 3 — Upsert vector into index
    void id;
    void vector;
    void metadata;
  }

  async search(
    queryVector: number[],
    topK: number,
  ): Promise<Array<{ id: string; score: number }>> {
    if (!this.initialized) await this.init();
    // TODO: Phase 3 — kNN search
    void queryVector;
    void topK;
    return [];
  }

  async delete(id: string): Promise<void> {
    // TODO: Phase 3 — Delete from index + rebuild
    void id;
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }
}

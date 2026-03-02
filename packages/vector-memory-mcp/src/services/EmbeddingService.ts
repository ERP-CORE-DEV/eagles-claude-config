// EmbeddingService — wraps @xenova/transformers for sentence embeddings.
// Uses model Xenova/all-MiniLM-L6-v2 (384 dimensions).
// Model is lazy-loaded on first embed call (~90MB download, cached by transformers).
// CRITICAL: ONNX logs to stdout which corrupts MCP stdio transport.
//           We suppress those logs before loading the pipeline.

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;

export class EmbeddingService {
  private pipeline: ((text: string, options?: Record<string, unknown>) => Promise<unknown>) | null = null;

  async embed(text: string): Promise<number[]> {
    const pipe = await this.loadPipeline();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return this.extractVector(output);
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    const pipe = await this.loadPipeline();
    const results: number[][] = [];
    for (const text of texts) {
      const output = await pipe(text, { pooling: "mean", normalize: true });
      results.push(this.extractVector(output));
    }
    return results;
  }

  isLoaded(): boolean {
    return this.pipeline !== null;
  }

  getDimensions(): number {
    return DIMENSIONS;
  }

  getModelName(): string {
    return MODEL_NAME;
  }

  private async loadPipeline(): Promise<(text: string, options?: Record<string, unknown>) => Promise<unknown>> {
    if (this.pipeline !== null) {
      return this.pipeline;
    }

    // Suppress ONNX stdout noise before importing transformers.
    // Without this, ONNX runtime writes progress to stdout and corrupts MCP stdio.
    const { env, pipeline } = await import("@xenova/transformers");
    const envRecord = env as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const onnxBackends = envRecord["backends"];
    if (onnxBackends !== undefined) {
      const onnxEnv = onnxBackends["onnx"];
      if (onnxEnv !== undefined) {
        onnxEnv["logLevel"] = "error";
      }
    }

    const pipe = await pipeline("feature-extraction", MODEL_NAME);
    this.pipeline = pipe as (text: string, options?: Record<string, unknown>) => Promise<unknown>;
    return this.pipeline;
  }

  private extractVector(output: unknown): number[] {
    // @xenova/transformers returns a Tensor object with a .data Float32Array
    const tensor = output as { data: Float32Array | number[] };
    const raw = tensor.data;
    const vector = Array.from(raw as ArrayLike<number>);
    if (vector.length !== DIMENSIONS) {
      throw new Error(
        `Expected ${DIMENSIONS}-dimensional vector but got ${vector.length}. ` +
        `Check model name: ${MODEL_NAME}`,
      );
    }
    return vector;
  }
}

/**
 * EmbeddingService — the only place chunks and queries become vectors.
 * Batched by default so ingestion never issues one request per chunk.
 */
import { EMBEDDING_CONFIG } from "./config";
import { gatewayFetch } from "./gateway.server";

export interface EmbeddingServiceOptions {
  model?: string;
  dimensions?: number;
  batchSize?: number;
}

export class EmbeddingService {
  readonly model: string;
  readonly dimensions: number;
  private readonly batchSize: number;

  constructor(options: EmbeddingServiceOptions = {}) {
    this.model = options.model ?? EMBEDDING_CONFIG.model;
    this.dimensions = options.dimensions ?? EMBEDDING_CONFIG.dimensions;
    this.batchSize = options.batchSize ?? EMBEDDING_CONFIG.batchSize;
  }

  private async embed(inputs: string[]): Promise<number[][]> {
    const json = await gatewayFetch("/embeddings", {
      model: this.model,
      input: inputs,
    });
    const data = (json.data ?? []) as { index: number; embedding: number[] }[];
    const ordered = new Array<number[]>(inputs.length);
    for (const item of data) ordered[item.index] = item.embedding;
    return ordered;
  }

  /** Embed a single retrieval query. */
  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await this.embed([query]);
    if (!vector) throw new Error("Embedding provider returned no vector for the query.");
    return vector;
  }

  /** Embed one document chunk. */
  async embedDocument(text: string): Promise<number[]> {
    return this.embedQuery(text);
  }

  /** Embed many chunks, chunked into provider-safe batches. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      out.push(...(await this.embed(batch)));
    }
    return out;
  }
}

/**
 * Pipeline orchestration: the wiring between every RAG stage.
 *
 * ingest:  parse -> chunk -> store -> embed -> index
 * query:   embed -> vector search -> keyword search -> fuse -> rerank
 *          -> context -> generate -> cite -> log
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { EMBEDDING_CONFIG, RETRIEVAL_DEFAULTS } from "./config";
import { buildContext } from "./context.server";
import { EmbeddingService } from "./embedding.server";
import { GenerationService, INSUFFICIENT_CONTEXT_ANSWER } from "./generation.server";
import { chunkDocument } from "./chunking";
import { parseFile, type RawFile } from "./parsing";
import { createReranker } from "./rerank.server";
import { fuseResults, keywordSearch, semanticSearch } from "./retrieval.server";
import type { PipelineTimings, QueryMode, RetrievalFilters, RetrievedChunk } from "./types";

type Db = SupabaseClient<any, any, any>;

const now = () => Date.now();

/* ------------------------------------------------------------------ ingest */

/** Parse + chunk + persist documents and chunks (embeddings come after). */
export async function ingestFiles(
  db: Db,
  sourceId: string,
  files: RawFile[],
  chunkOptions: { chunkSize?: number; chunkOverlap?: number } = {},
): Promise<{ documents: number; chunks: number }> {
  let documentCount = 0;
  let chunkCount = 0;

  for (const file of files) {
    const parsed = parseFile(file);
    const { data: docRow, error: docError } = await db
      .from("documents")
      .insert({
        source_id: sourceId,
        file_name: parsed.file_name,
        file_path: parsed.file_path,
        content: parsed.content,
        language: parsed.language,
        metadata: parsed.metadata as any,
      })
      .select("id")
      .single();
    if (docError) throw new Error(`Failed to store ${parsed.file_path}: ${docError.message}`);
    documentCount += 1;

    const chunks = chunkDocument(parsed, chunkOptions);
    if (chunks.length === 0) continue;

    const rows = chunks.map((chunk) => ({
      source_id: sourceId,
      document_id: docRow!.id,
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      chunk_type: chunk.chunk_type,
      file_path: chunk.file_path,
      language: chunk.language,
      section: chunk.section,
      line_start: chunk.line_start,
      line_end: chunk.line_end,
      page_number: chunk.page_number,
      token_estimate: chunk.token_estimate,
      metadata: (parsed.metadata ?? {}) as any,
    }));

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("chunks").insert(rows.slice(i, i + 200));
      if (error) throw new Error(`Failed to store chunks for ${parsed.file_path}: ${error.message}`);
    }
    chunkCount += rows.length;
  }

  return { documents: documentCount, chunks: chunkCount };
}

/** Embed a bounded batch of not-yet-embedded chunks; returns what remains. */
export async function embedPendingChunks(
  db: Db,
  sourceId: string,
  limit = 64,
): Promise<{ embedded: number; remaining: number }> {
  const { data: pending, error } = await db
    .from("chunks")
    .select("id, content")
    .eq("source_id", sourceId)
    .is("embedding", null)
    .limit(limit);
  if (error) throw new Error(`Could not load chunks to embed: ${error.message}`);
  if (!pending || pending.length === 0) return { embedded: 0, remaining: 0 };

  const service = new EmbeddingService();
  const vectors = await service.embedBatch(pending.map((c: any) => c.content));

  for (let i = 0; i < pending.length; i++) {
    const vector = vectors[i];
    if (!vector) continue;
    const { error: updateError } = await db
      .from("chunks")
      .update({ embedding: JSON.stringify(vector) as any, embedding_model: service.model })
      .eq("id", (pending[i] as any).id);
    if (updateError) throw new Error(`Failed to store embedding: ${updateError.message}`);
  }

  const { count } = await db
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId)
    .is("embedding", null);

  return { embedded: pending.length, remaining: count ?? 0 };
}

/* ------------------------------------------------------------------- query */

export interface RagRunOptions {
  query: string;
  mode: QueryMode;
  filters: RetrievalFilters;
  topK?: number;
  candidateK?: number;
  rerankTopN?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  history?: { role: string; content: string }[];
  /** Retrieval only — used by evaluation's retrieval-metric pass. */
  skipGeneration?: boolean;
}

export interface RagRunOutput {
  semantic: RetrievedChunk[];
  keyword: RetrievedChunk[];
  hybrid: RetrievedChunk[];
  reranked: RetrievedChunk[];
  contextChunks: RetrievedChunk[];
  citations: ReturnType<typeof buildContext>["citations"];
  answer: string;
  grounded: boolean;
  rerankerUsed: boolean;
  rerankerModel: string | null;
  rerankerError?: string;
  timings: PipelineTimings;
  embeddingModel: string;
  embeddingDimensions: number;
  generationStatus: string;
}

export async function runRagPipeline(db: Db, options: RagRunOptions): Promise<RagRunOutput> {
  const started = now();
  const timings: PipelineTimings = {
    embedding_ms: 0,
    vector_search_ms: 0,
    keyword_search_ms: 0,
    fusion_ms: 0,
    rerank_ms: 0,
    context_ms: 0,
    generation_ms: 0,
    total_ms: 0,
  };

  const topK = options.topK ?? RETRIEVAL_DEFAULTS.topK;
  const candidateK = options.candidateK ?? RETRIEVAL_DEFAULTS.candidateK;
  const rerankTopN = options.rerankTopN ?? RETRIEVAL_DEFAULTS.rerankTopN;

  // 1. Query embedding
  const embeddingService = new EmbeddingService();
  let t = now();
  const queryVector = await embeddingService.embedQuery(options.query);
  timings.embedding_ms = now() - t;

  // 2. Semantic + 3. keyword retrieval (independent, run in parallel)
  t = now();
  const semanticPromise = semanticSearch(db, queryVector, options.filters, topK).then((r) => {
    timings.vector_search_ms = now() - t;
    return r;
  });
  const keywordStart = now();
  const keywordPromise = keywordSearch(db, options.query, options.filters, topK).then((r) => {
    timings.keyword_search_ms = now() - keywordStart;
    return r;
  });
  const [semantic, keyword] = await Promise.all([semanticPromise, keywordPromise]);

  // 4. Hybrid fusion
  t = now();
  const hybrid = fuseResults(semantic, keyword, {
    ...(options.semanticWeight !== undefined ? { semanticWeight: options.semanticWeight } : {}),
    ...(options.keywordWeight !== undefined ? { keywordWeight: options.keywordWeight } : {}),
    limit: candidateK,
  });
  timings.fusion_ms = now() - t;

  // 5. Reranking
  t = now();
  const reranker = createReranker();
  const rerankOutcome = reranker
    ? await reranker.rerank(options.query, hybrid, rerankTopN)
    : { chunks: hybrid.slice(0, rerankTopN), used: false, model: null as string | null };
  timings.rerank_ms = now() - t;

  // 6. Context construction
  t = now();
  const context = buildContext(rerankOutcome.chunks);
  timings.context_ms = now() - t;

  // 7. Generation
  let answer = "";
  let grounded = false;
  let generationStatus = "skipped";

  if (!options.skipGeneration) {
    if (context.chunks.length === 0) {
      answer = INSUFFICIENT_CONTEXT_ANSWER;
      generationStatus = "no_context";
    } else {
      t = now();
      try {
        const generation = new GenerationService();
        const result = await generation.generate({
          query: options.query,
          context: context.prompt,
          mode: options.mode,
          ...(options.history ? { history: options.history } : {}),
        });
        answer = result.answer;
        grounded = !answer.startsWith(INSUFFICIENT_CONTEXT_ANSWER);
        generationStatus = "ok";
      } catch (error) {
        timings.generation_ms = now() - t;
        throw error;
      }
      timings.generation_ms = now() - t;
    }
  }

  timings.total_ms = now() - started;

  return {
    semantic,
    keyword,
    hybrid,
    reranked: rerankOutcome.chunks,
    contextChunks: context.chunks,
    citations: context.citations,
    answer,
    grounded,
    rerankerUsed: rerankOutcome.used,
    rerankerModel: rerankOutcome.model,
    ...(("error" in rerankOutcome && rerankOutcome.error) ? { rerankerError: rerankOutcome.error } : {}),
    timings,
    embeddingModel: embeddingService.model,
    embeddingDimensions: EMBEDDING_CONFIG.dimensions,
    generationStatus,
  };
}

/** Compact projection of a chunk for the retrieval log / inspector. */
export function toLogEntry(chunk: RetrievedChunk) {
  return {
    id: chunk.id,
    file_path: chunk.file_path,
    section: chunk.section,
    language: chunk.language,
    chunk_type: chunk.chunk_type,
    line_start: chunk.line_start,
    line_end: chunk.line_end,
    page_number: chunk.page_number,
    semantic_score: chunk.semantic_score ?? null,
    keyword_score: chunk.keyword_score ?? null,
    hybrid_score: chunk.hybrid_score ?? null,
    rerank_score: chunk.rerank_score ?? null,
    original_rank: chunk.original_rank ?? null,
    reranked_rank: chunk.reranked_rank ?? null,
    matched_terms: chunk.matched_terms ?? [],
    preview: chunk.content.slice(0, 600),
  };
}

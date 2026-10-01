/**
 * Retrieval stage: semantic (pgvector), keyword (Postgres FTS) and the hybrid
 * fusion that combines them with normalised, weighted scores.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { RETRIEVAL_DEFAULTS } from "./config";
import type { RetrievalFilters, RetrievedChunk } from "./types";

type Db = SupabaseClient<any, any, any>;

function rowToChunk(row: any): RetrievedChunk {
  return {
    id: row.id,
    document_id: row.document_id,
    source_id: row.source_id,
    content: row.content,
    chunk_type: row.chunk_type,
    file_path: row.file_path,
    language: row.language,
    section: row.section,
    line_start: row.line_start,
    line_end: row.line_end,
    page_number: row.page_number,
  };
}

export async function semanticSearch(
  db: Db,
  queryEmbedding: number[],
  filters: RetrievalFilters,
  limit: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
    match_count: limit,
    p_source_id: filters.source_id ?? null,
    p_language: filters.language ?? null,
    p_file_type: filters.file_type ?? null,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({ ...rowToChunk(row), semantic_score: row.similarity }));
}

/** Terms the FTS query actually looked for, used by the Retrieval Inspector. */
export function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .split(/[^A-Za-z0-9_./()]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2),
    ),
  );
}

export async function keywordSearch(
  db: Db,
  query: string,
  filters: RetrievalFilters,
  limit: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await db.rpc("keyword_search_chunks", {
    query_text: query,
    match_count: limit,
    p_source_id: filters.source_id ?? null,
    p_language: filters.language ?? null,
    p_file_type: filters.file_type ?? null,
  });
  if (error) throw new Error(`Keyword search failed: ${error.message}`);

  const terms = queryTerms(query).map((t) => t.toLowerCase());
  return (data ?? []).map((row: any) => {
    const lower = (row.content ?? "").toLowerCase();
    return {
      ...rowToChunk(row),
      keyword_score: row.keyword_score,
      matched_terms: terms.filter((t) => lower.includes(t)).slice(0, 8),
    };
  });
}

function normalise(values: number[]): (value: number) => number {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min;
  return (value: number) => (span <= 1e-9 ? (max > 0 ? 1 : 0) : (value - min) / span);
}

export interface FusionOptions {
  semanticWeight?: number;
  keywordWeight?: number;
  limit?: number;
}

/**
 * Weighted score fusion. Both score families are min-max normalised first, so a
 * raw ts_rank_cd value can never dominate a cosine similarity (or vice versa).
 */
export function fuseResults(
  semantic: RetrievedChunk[],
  keyword: RetrievedChunk[],
  options: FusionOptions = {},
): RetrievedChunk[] {
  const semanticWeight = options.semanticWeight ?? RETRIEVAL_DEFAULTS.semanticWeight;
  const keywordWeight = options.keywordWeight ?? RETRIEVAL_DEFAULTS.keywordWeight;
  const limit = options.limit ?? RETRIEVAL_DEFAULTS.candidateK;

  const normSemantic = normalise(semantic.map((c) => c.semantic_score ?? 0));
  const normKeyword = normalise(keyword.map((c) => c.keyword_score ?? 0));

  const merged = new Map<string, RetrievedChunk>();
  for (const chunk of semantic) merged.set(chunk.id, { ...chunk });
  for (const chunk of keyword) {
    const existing = merged.get(chunk.id);
    if (existing) {
      if (chunk.keyword_score !== undefined) existing.keyword_score = chunk.keyword_score;
      if (chunk.matched_terms) existing.matched_terms = chunk.matched_terms;
    } else {
      merged.set(chunk.id, { ...chunk });
    }
  }

  const fused = Array.from(merged.values()).map((chunk) => ({
    ...chunk,
    hybrid_score:
      semanticWeight * normSemantic(chunk.semantic_score ?? 0) +
      keywordWeight * normKeyword(chunk.keyword_score ?? 0),
  }));

  fused.sort((a, b) => (b.hybrid_score ?? 0) - (a.hybrid_score ?? 0));
  return fused.slice(0, limit).map((chunk, i) => ({ ...chunk, original_rank: i + 1 }));
}

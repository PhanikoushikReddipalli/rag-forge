/**
 * Shared RAG domain types. Client-safe (no server imports) so the UI and the
 * pipeline speak the exact same contracts.
 */

export type QueryMode = "ask" | "debug" | "explain";

export type ChunkType =
  | "function"
  | "class"
  | "block"
  | "section"
  | "paragraph"
  | "code"
  | "page";

export interface ChunkMetadata {
  file_path: string;
  language: string | null;
  chunk_type: ChunkType;
  line_start: number | null;
  line_end: number | null;
  page_number: number | null;
  section: string | null;
  repository?: string | null;
  branch?: string | null;
}

export interface RawChunk extends ChunkMetadata {
  content: string;
  chunk_index: number;
  token_estimate: number;
}

export interface ParsedDocument {
  file_name: string;
  file_path: string;
  content: string;
  language: string | null;
  metadata: Record<string, unknown>;
  /** Present for PDFs: page-separated text used for page-aware chunking. */
  pages?: { page: number; text: string }[];
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  source_id: string;
  content: string;
  chunk_type: string;
  file_path: string | null;
  language: string | null;
  section: string | null;
  line_start: number | null;
  line_end: number | null;
  page_number: number | null;
  /** Cosine similarity from pgvector, when the chunk came from vector search. */
  semantic_score?: number;
  /** ts_rank_cd score, when the chunk came from full-text search. */
  keyword_score?: number;
  /** Normalised fused score. */
  hybrid_score?: number;
  rerank_score?: number;
  original_rank?: number;
  reranked_rank?: number;
  matched_terms?: string[];
}

export interface Citation {
  index: number;
  chunk_id: string;
  file_path: string | null;
  section: string | null;
  line_start: number | null;
  line_end: number | null;
  page_number: number | null;
  language: string | null;
  content: string;
}

export interface PipelineTimings {
  embedding_ms: number;
  vector_search_ms: number;
  keyword_search_ms: number;
  fusion_ms: number;
  rerank_ms: number;
  context_ms: number;
  generation_ms: number;
  total_ms: number;
}

export interface RetrievalFilters {
  source_id?: string | null;
  language?: string | null;
  file_type?: string | null;
}

export interface QueryResult {
  request_id: string;
  retrieval_log_id: string;
  conversation_id: string;
  answer: string;
  grounded: boolean;
  citations: Citation[];
  timings: PipelineTimings;
  reranker_used: boolean;
  reranker_model: string | null;
  candidates_searched: number;
}

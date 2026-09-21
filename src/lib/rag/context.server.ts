/**
 * ContextBuilder: dedupe, relevance-sort, budget and format the evidence that
 * actually reaches the LLM, while keeping citation metadata intact.
 */
import { RETRIEVAL_DEFAULTS } from "./config";
import type { Citation, RetrievedChunk } from "./types";

export interface BuiltContext {
  chunks: RetrievedChunk[];
  citations: Citation[];
  prompt: string;
  totalChars: number;
}

function score(chunk: RetrievedChunk): number {
  return chunk.rerank_score ?? chunk.hybrid_score ?? chunk.semantic_score ?? 0;
}

function fingerprint(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 240).toLowerCase();
}

export function buildContext(
  chunks: RetrievedChunk[],
  options: { maxChars?: number; minRelevance?: number } = {},
): BuiltContext {
  const maxChars = options.maxChars ?? RETRIEVAL_DEFAULTS.maxContextChars;
  const minRelevance = options.minRelevance ?? RETRIEVAL_DEFAULTS.minRelevance;

  const seen = new Set<string>();
  const selected: RetrievedChunk[] = [];
  let total = 0;

  for (const chunk of [...chunks].sort((a, b) => score(b) - score(a))) {
    if (score(chunk) < minRelevance) continue;
    const key = fingerprint(chunk.content);
    if (seen.has(key)) continue;
    if (total + chunk.content.length > maxChars && selected.length > 0) continue;
    seen.add(key);
    selected.push(chunk);
    total += chunk.content.length;
  }

  const citations: Citation[] = selected.map((chunk, i) => ({
    index: i + 1,
    chunk_id: chunk.id,
    file_path: chunk.file_path,
    section: chunk.section,
    line_start: chunk.line_start,
    line_end: chunk.line_end,
    page_number: chunk.page_number,
    language: chunk.language,
    content: chunk.content,
  }));

  const prompt = selected
    .map((chunk, i) => {
      const location = [
        chunk.file_path,
        chunk.line_start ? `lines ${chunk.line_start}-${chunk.line_end ?? chunk.line_start}` : null,
        chunk.page_number ? `page ${chunk.page_number}` : null,
        chunk.section ? `section: ${chunk.section}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return `[${i + 1}] ${location}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  return { chunks: selected, citations, prompt, totalChars: total };
}

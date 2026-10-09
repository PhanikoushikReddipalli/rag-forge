/**
 * Live end-to-end RAG check against the real AI gateway (no database):
 * question -> embed -> semantic + keyword -> fuse -> rerank -> context -> LLM -> citations.
 * Run with: bun src/lib/rag/__tests__/e2e.live.ts   (requires LOVABLE_API_KEY)
 */
import { chunkDocument } from "../chunking";
import { buildContext } from "../context.server";
import { DEMO_FILES } from "../demo-corpus";
import { EmbeddingService } from "../embedding.server";
import { GenerationService } from "../generation.server";
import { parseFile } from "../parsing";
import { LlmListwiseReranker } from "../rerank.server";
import { fuseResults, queryTerms } from "../retrieval.server";
import type { RetrievedChunk } from "../types";

const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return d / Math.sqrt(na * nb);
};

const query = process.argv[2] ?? "Why might login return 401 after deployment?";
const chunks: RetrievedChunk[] = DEMO_FILES.flatMap((f) => chunkDocument(parseFile(f))).map((c, i) => ({
  ...c, id: `c${i}`, document_id: c.file_path, source_id: "demo",
}));
const emb = new EmbeddingService();
const vectors = await emb.embedBatch(chunks.map((c) => c.content));
const qv = await emb.embedQuery(query);

const semantic = chunks.map((c, i) => ({ ...c, semantic_score: cos(qv, vectors[i]!) }))
  .sort((a, b) => b.semantic_score - a.semantic_score).slice(0, 10);
const terms = queryTerms(query).map((t) => t.toLowerCase());
const keyword = chunks.map((c) => {
  const hits = terms.filter((t) => c.content.toLowerCase().includes(t));
  return { ...c, keyword_score: hits.length / Math.max(terms.length, 1), matched_terms: hits };
}).filter((c) => c.keyword_score > 0).sort((a, b) => b.keyword_score - a.keyword_score).slice(0, 10);

const hybrid = fuseResults(semantic, keyword);
const reranked = await new LlmListwiseReranker().rerank(query, hybrid, 5);
const ctx = buildContext(reranked.chunks);
const gen = await new GenerationService().generate({ query, context: ctx.prompt, mode: "debug" });

console.log(`chunks=${chunks.length} dims=${qv.length} reranker_used=${reranked.used}`);
console.log("top:", reranked.chunks.map((c) => `${c.file_path}(${c.rerank_score?.toFixed(2)})`).join(", "));
console.log("citations:", ctx.citations.map((c) => `[${c.index}] ${c.file_path}`).join(" "));
console.log("answer:\n", gen.answer.slice(0, 900));
if (!/\[\d\]/.test(gen.answer)) { console.error("FAIL: answer has no citations"); process.exit(1); }

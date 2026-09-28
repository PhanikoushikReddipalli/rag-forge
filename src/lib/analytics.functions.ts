/**
 * Analytics API — every number is aggregated from stored rows.
 * Demo vs. real data is split by the source's is_demo flag.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [sources, logs, results, embedded] = await Promise.all([
      db.from("knowledge_sources").select("id, name, source_type, is_demo, document_count, chunk_count, status"),
      db
        .from("retrieval_logs")
        .select("id, source_id, mode, latency_ms, timings, answered, generation_status, created_at, final_context")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("evaluation_results")
        .select("run_id, recall_at_k, precision_at_k, mrr, faithfulness, answer_relevance, context_relevance, hit, latency_ms, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("chunks").select("id", { count: "exact", head: true }).not("embedding", "is", null),
    ]);

    const srcs = sources.data ?? [];
    const demoIds = new Set(srcs.filter((s) => s.is_demo).map((s) => s.id));
    const rawLogs = (logs.data ?? []) as any[];

    const queries = rawLogs.map((l) => {
      const t = (l.timings ?? {}) as Record<string, number>;
      const retrieval = (t["embedding_ms"] ?? 0) + (t["vector_search_ms"] ?? 0) + (t["keyword_search_ms"] ?? 0) + (t["fusion_ms"] ?? 0) + (t["rerank_ms"] ?? 0);
      return {
        id: l.id,
        created_at: l.created_at as string,
        mode: l.mode as string,
        is_demo: l.source_id ? demoIds.has(l.source_id) : false,
        latency_ms: l.latency_ms ?? 0,
        retrieval_ms: retrieval,
        generation_ms: t["generation_ms"] ?? 0,
        answered: !!l.answered,
        status: l.generation_status as string | null,
        files: ((l.final_context ?? []) as any[]).map((c) => c.file_path).filter(Boolean) as string[],
      };
    });

    return {
      sources: srcs,
      totals: {
        sources: srcs.length,
        documents: srcs.reduce((a, s) => a + (s.document_count ?? 0), 0),
        chunks: srcs.reduce((a, s) => a + (s.chunk_count ?? 0), 0),
        embeddings: embedded.count ?? 0,
      },
      queries,
      evaluation: results.data ?? [],
    };
  });

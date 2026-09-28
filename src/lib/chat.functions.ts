/**
 * Query API: runs the full RAG pipeline for a chat turn, persists messages and
 * writes an inspectable retrieval log (request-id correlated).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { Citation, PipelineTimings, QueryMode, RetrievalFilters } from "./rag/types";

export interface QueryInput {
  conversation_id?: string | null;
  query: string;
  mode: QueryMode;
  filters?: RetrievalFilters;
  semantic_weight?: number;
  keyword_weight?: number;
  top_k?: number;
}

export interface QueryResponse {
  request_id: string;
  conversation_id: string;
  retrieval_log_id: string;
  message_id: string;
  answer: string;
  grounded: boolean;
  citations: Citation[];
  timings: PipelineTimings;
  reranker_used: boolean;
  candidates: number;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, title, updated_at, source_id")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const [conv, msgs] = await Promise.all([
      context.supabase.from("conversations").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (conv.error) throw new Error(conv.error.message);
    if (!conv.data) throw new Error("Conversation not found.");
    return { conversation: conv.data, messages: (msgs.data ?? []) as any[] };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("messages").delete().eq("conversation_id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: QueryInput) => {
    if (!input.query?.trim()) throw new Error("Query cannot be empty.");
    if (!["ask", "debug", "explain"].includes(input.mode)) throw new Error("Invalid mode.");
    return { ...input, query: input.query.trim().slice(0, 2000) };
  })
  .handler(async ({ data, context }): Promise<QueryResponse> => {
    const db = context.supabase;
    const requestId = crypto.randomUUID();
    const { runRagPipeline, toLogEntry } = await import("./rag/pipeline.server");

    // Conversation bootstrap
    let conversationId = data.conversation_id ?? null;
    if (!conversationId) {
      const { data: conv, error } = await db
        .from("conversations")
        .insert({ title: data.query.slice(0, 80), source_id: data.filters?.source_id ?? null })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = conv!.id;
    }

    const { data: prior } = await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(12);

    const { error: userMsgError } = await db
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", content: data.query, mode: data.mode });
    if (userMsgError) throw new Error(userMsgError.message);

    const filters = data.filters ?? {};
    let output;
    try {
      output = await runRagPipeline(db, {
        query: data.query,
        mode: data.mode,
        filters,
        ...(data.top_k ? { topK: data.top_k } : {}),
        ...(data.semantic_weight !== undefined ? { semanticWeight: data.semantic_weight } : {}),
        ...(data.keyword_weight !== undefined ? { keywordWeight: data.keyword_weight } : {}),
        history: (prior ?? []).map((m: any) => ({ role: m.role, content: m.content })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pipeline failed";
      await db.from("retrieval_logs").insert({
        request_id: requestId,
        conversation_id: conversationId,
        query: data.query,
        mode: data.mode,
        filters: filters as any,
        generation_status: "error",
        answered: false,
        error_message: message,
      });
      console.error(JSON.stringify({ request_id: requestId, user_id: context.userId, status: "error", error: message }));
      throw new Error(message);
    }

    const { data: log, error: logError } = await db
      .from("retrieval_logs")
      .insert({
        request_id: requestId,
        conversation_id: conversationId,
        source_id: filters.source_id ?? null,
        query: data.query,
        mode: data.mode,
        retrieval_method: "hybrid",
        filters: filters as any,
        embedding_model: output.embeddingModel,
        embedding_dimensions: output.embeddingDimensions,
        semantic_results: output.semantic.map(toLogEntry) as any,
        keyword_results: output.keyword.map(toLogEntry) as any,
        hybrid_results: output.hybrid.map(toLogEntry) as any,
        reranked_results: output.reranked.map(toLogEntry) as any,
        final_context: output.contextChunks.map(toLogEntry) as any,
        reranker_used: output.rerankerUsed,
        reranker_model: output.rerankerModel,
        timings: output.timings as any,
        latency_ms: output.timings.total_ms,
        generation_status: output.generationStatus,
        answered: output.grounded,
        error_message: output.rerankerError ?? null,
      })
      .select("id")
      .single();
    if (logError) throw new Error(logError.message);

    const { data: msg, error: msgError } = await db
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: output.answer,
        mode: data.mode,
        citations: output.citations as any,
        retrieval_log_id: log!.id,
        grounded: output.grounded,
      })
      .select("id")
      .single();
    if (msgError) throw new Error(msgError.message);

    await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    // Structured observability log (no document content, no secrets).
    console.log(
      JSON.stringify({
        request_id: requestId,
        user_id: context.userId,
        mode: data.mode,
        retrieval_method: "hybrid",
        candidates: output.hybrid.length,
        reranked: output.reranked.length,
        context: output.contextChunks.length,
        latency_ms: output.timings.total_ms,
        generation_status: output.generationStatus,
      }),
    );

    return {
      request_id: requestId,
      conversation_id: conversationId!,
      retrieval_log_id: log!.id,
      message_id: msg!.id,
      answer: output.answer,
      grounded: output.grounded,
      citations: output.citations,
      timings: output.timings,
      reranker_used: output.rerankerUsed,
      candidates: output.hybrid.length,
    };
  });

export const getRetrievalLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: log, error } = await context.supabase
      .from("retrieval_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!log) throw new Error("Retrieval log not found.");
    return log as any;
  });

export const getChunkContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chunk_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: chunk, error } = await context.supabase
      .from("chunks")
      .select("id, content, file_path, language, section, line_start, line_end, page_number, chunk_type, document_id, source_id")
      .eq("id", data.chunk_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!chunk) throw new Error("Source chunk no longer exists.");
    const { data: doc } = await context.supabase
      .from("documents")
      .select("file_name, file_path, content, language, metadata")
      .eq("id", chunk.document_id)
      .maybeSingle();
    const { data: source } = await context.supabase
      .from("knowledge_sources")
      .select("name, source_type, is_demo")
      .eq("id", chunk.source_id)
      .maybeSingle();
    return { chunk, document: doc, source };
  });

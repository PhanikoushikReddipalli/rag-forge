/**
 * Evaluation API. Retrieval metrics come from the real retrieval output;
 * faithfulness / relevance come from an LLM judge over the real answer.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { computeRetrievalMetrics } from "./rag/evaluation";

export const listEvalQuestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("evaluation_questions")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvalQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { question: string; expected_answer?: string; expected_sources: string[]; source_id?: string | null }) => {
      if (!input.question?.trim()) throw new Error("Question is required.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("evaluation_questions")
      .insert({
        question: data.question.trim(),
        expected_answer: data.expected_answer ?? null,
        expected_sources: data.expected_sources.map((s) => s.trim()).filter(Boolean),
        source_id: data.source_id ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvalQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("evaluation_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Evaluate one question within a run. The client iterates the benchmark. */
export const runEvalQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string; question_id: string; k?: number }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const k = data.k ?? 5;
    const { data: q, error } = await db
      .from("evaluation_questions")
      .select("*")
      .eq("id", data.question_id)
      .maybeSingle();
    if (error || !q) throw new Error("Evaluation question not found.");

    const started = Date.now();
    try {
      const { runRagPipeline } = await import("./rag/pipeline.server");
      const { judgeAnswer } = await import("./rag/judge.server");

      const out = await runRagPipeline(db, {
        query: q.question,
        mode: "ask",
        filters: { source_id: q.source_id ?? null },
        rerankTopN: k,
      });

      const retrievedPaths = out.reranked.map((c) => c.file_path ?? "").filter(Boolean);
      const metrics = computeRetrievalMetrics(retrievedPaths, q.expected_sources ?? []);
      const judged = await judgeAnswer({
        question: q.question,
        answer: out.answer,
        context: out.contextChunks.map((c) => c.content),
        expectedAnswer: q.expected_answer,
      });

      const row = {
        run_id: data.run_id,
        question_id: q.id,
        generated_answer: out.answer,
        retrieved_sources: retrievedPaths,
        hit: metrics.hit,
        recall_at_k: metrics.recall_at_k,
        precision_at_k: metrics.precision_at_k,
        mrr: metrics.mrr,
        context_relevance: judged.context_relevance,
        faithfulness: judged.faithfulness,
        answer_relevance: judged.answer_relevance,
        latency_ms: Date.now() - started,
      };
      const { error: insertError } = await db.from("evaluation_results").insert(row);
      if (insertError) throw new Error(insertError.message);
      return row;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evaluation failed";
      await db.from("evaluation_results").insert({
        run_id: data.run_id,
        question_id: q.id,
        error_message: message,
        latency_ms: Date.now() - started,
      });
      throw new Error(message);
    }
  });

export const listEvalResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("evaluation_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Knowledge-source API: create, ingest, embed, re-index and delete sources.
 * Ingestion is deliberately step-wise so the UI can show real stage progress
 * and long repositories never block a single request.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { DEMO_EVALUATION_QUESTIONS, DEMO_FILES, DEMO_SOURCE_NAME } from "./rag/demo-corpus";
import type { RawFile } from "./rag/parsing";

export interface UploadedFileInput {
  file_name: string;
  file_path: string;
  content: string;
  pages?: { page: number; text: string }[];
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("knowledge_sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const [source, documents] = await Promise.all([
      context.supabase.from("knowledge_sources").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("documents")
        .select("id, file_name, file_path, language, metadata, created_at")
        .eq("source_id", data.id)
        .order("file_path"),
    ]);
    if (source.error) throw new Error(source.error.message);
    if (!source.data) throw new Error("Knowledge source not found.");
    return { source: source.data, documents: documents.data ?? [] };
  });

export const createSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      source_type: "github" | "pdf" | "markdown" | "txt";
      source_url?: string | null;
      chunk_size?: number;
      chunk_overlap?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (data.source_type === "github") {
      const { parseRepoUrl } = await import("./rag/github.server");
      parseRepoUrl(data.source_url ?? ""); // validates the URL before we create anything
    }
    const { data: row, error } = await context.supabase
      .from("knowledge_sources")
      .insert({
        name: data.name,
        source_type: data.source_type,
        source_url: data.source_url ?? null,
        status: "pending",
        stage: "queued",
        config: {
          chunk_size: data.chunk_size ?? null,
          chunk_overlap: data.chunk_overlap ?? null,
        } as any,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

async function markFailed(supabase: any, sourceId: string, message: string) {
  await supabase
    .from("knowledge_sources")
    .update({ status: "failed", stage: "failed", error_message: message, updated_at: new Date().toISOString() })
    .eq("id", sourceId);
}

async function runIngestion(supabase: any, sourceId: string, files: RawFile[]) {
  const { ingestFiles } = await import("./rag/pipeline.server");
  const { data: source } = await supabase
    .from("knowledge_sources")
    .select("config")
    .eq("id", sourceId)
    .maybeSingle();

  const config = (source?.config ?? {}) as { chunk_size?: number; chunk_overlap?: number };
  // Idempotent: clear leftovers from an interrupted earlier run so chunks are never duplicated.
  const { error: wipeError } = await supabase.from("documents").delete().eq("source_id", sourceId);
  if (wipeError) throw new Error(`Could not reset previous documents: ${wipeError.message}`);
  await supabase
    .from("knowledge_sources")
    .update({ status: "processing", stage: "chunking", progress: 35 })
    .eq("id", sourceId);

  const result = await ingestFiles(supabase, sourceId, files, {
    ...(config.chunk_size ? { chunkSize: config.chunk_size } : {}),
    ...(config.chunk_overlap !== undefined && config.chunk_overlap !== null
      ? { chunkOverlap: config.chunk_overlap }
      : {}),
  });

  await supabase
    .from("knowledge_sources")
    .update({
      status: "processing",
      stage: "embedding",
      progress: 55,
      document_count: result.documents,
      chunk_count: result.chunks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  return result;
}

/** Ingest uploaded documents (markdown / txt / code / extracted PDF text). */
export const ingestDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source_id: string; files: UploadedFileInput[] }) => input)
  .handler(async ({ data, context }) => {
    try {
      await context.supabase
        .from("knowledge_sources")
        .update({ status: "processing", stage: "parsing", progress: 15, error_message: null })
        .eq("id", data.source_id);

      const files: RawFile[] = data.files.map((f) => ({
        file_name: f.file_name,
        file_path: f.file_path,
        content: f.content,
        ...(f.pages ? { pages: f.pages } : {}),
        metadata: { source_type: "upload" },
      }));

      return await runIngestion(context.supabase, data.source_id, files);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ingestion failed";
      await markFailed(context.supabase, data.source_id, message);
      throw new Error(message);
    }
  });

/** Fetch and ingest a GitHub repository. */
export const ingestGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source_id: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      const { data: source, error } = await context.supabase
        .from("knowledge_sources")
        .select("source_url")
        .eq("id", data.source_id)
        .maybeSingle();
      if (error || !source?.source_url) throw new Error("This source has no repository URL.");

      await context.supabase
        .from("knowledge_sources")
        .update({ status: "processing", stage: "fetching", progress: 10, error_message: null })
        .eq("id", data.source_id);

      const { fetchRepositoryFiles, parseRepoUrl } = await import("./rag/github.server");
      const ref = parseRepoUrl(source.source_url);
      const { files, branch } = await fetchRepositoryFiles(ref);

      await context.supabase
        .from("knowledge_sources")
        .update({ stage: "parsing", progress: 25, config: { repository: `${ref.owner}/${ref.repo}`, branch } as any })
        .eq("id", data.source_id);

      return await runIngestion(context.supabase, data.source_id, files);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub ingestion failed";
      await markFailed(context.supabase, data.source_id, message);
      throw new Error(message);
    }
  });

/** Embed one batch of pending chunks. The client loops until remaining === 0. */
export const embedStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source_id: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      const { embedPendingChunks } = await import("./rag/pipeline.server");
      const { embedded, remaining } = await embedPendingChunks(context.supabase, data.source_id, 48);

      const { count: total } = await context.supabase
        .from("chunks")
        .select("id", { count: "exact", head: true })
        .eq("source_id", data.source_id);

      const done = remaining === 0;
      const totalChunks = total ?? 0;
      const progress = done
        ? 100
        : Math.min(97, 55 + Math.round((((totalChunks - remaining) / Math.max(totalChunks, 1)) * 45)));

      await context.supabase
        .from("knowledge_sources")
        .update({
          status: done ? "indexed" : "processing",
          stage: done ? "complete" : "embedding",
          progress,
          chunk_count: totalChunks,
          ...(done ? { last_indexed_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.source_id);

      return { embedded, remaining, total: totalChunks };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding failed";
      await markFailed(context.supabase, data.source_id, message);
      throw new Error(message);
    }
  });

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("knowledge_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Wipe documents/chunks and put the source back into the ingestion queue. */
export const resetSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.from("documents").delete().eq("source_id", data.id);
    const { error } = await context.supabase
      .from("knowledge_sources")
      .update({
        status: "pending",
        stage: "queued",
        progress: 0,
        error_message: null,
        document_count: 0,
        chunk_count: 0,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Create (or reuse) the TaskFlow demo knowledge base for the current user. */
export const createDemoSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const existing = await context.supabase
      .from("knowledge_sources")
      .select("*")
      .eq("is_demo", true)
      .maybeSingle();
    if (existing.data) return existing.data;

    const { data: row, error } = await context.supabase
      .from("knowledge_sources")
      .insert({
        name: DEMO_SOURCE_NAME,
        source_type: "demo",
        is_demo: true,
        status: "pending",
        stage: "queued",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("evaluation_questions").insert(
      DEMO_EVALUATION_QUESTIONS.map((q) => ({
        source_id: row!.id,
        question: q.question,
        expected_answer: q.expected_answer,
        expected_sources: q.expected_sources,
      })),
    );

    return row;
  });

/** Ingest the demo corpus into a demo source (same pipeline as real data). */
export const ingestDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source_id: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      await context.supabase
        .from("knowledge_sources")
        .update({ status: "processing", stage: "parsing", progress: 15, error_message: null })
        .eq("id", data.source_id);
      return await runIngestion(context.supabase, data.source_id, DEMO_FILES);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Demo ingestion failed";
      await markFailed(context.supabase, data.source_id, message);
      throw new Error(message);
    }
  });

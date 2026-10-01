import { describe, expect, it, vi } from "vitest";

vi.mock("../gateway.server", () => ({ gatewayFetch: vi.fn() }));

import { fuseResults, queryTerms } from "../retrieval.server";
import { buildContext } from "../context.server";
import { LlmListwiseReranker } from "../rerank.server";
import { gatewayFetch } from "../gateway.server";
import type { RetrievedChunk } from "../types";

const chunk = (id: string, extra: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id, document_id: "d", source_id: "s", content: `content ${id}`, chunk_type: "function",
  file_path: `${id}.py`, language: "python", section: null, line_start: 1, line_end: 5, page_number: null, ...extra,
});

describe("hybrid fusion", () => {
  it("normalises and weights both score families", () => {
    const fused = fuseResults(
      [chunk("a", { semantic_score: 0.9 }), chunk("b", { semantic_score: 0.5 })],
      [chunk("b", { keyword_score: 0.8 }), chunk("c", { keyword_score: 0.1 })],
      { semanticWeight: 0.7, keywordWeight: 0.3 },
    );
    const byId = Object.fromEntries(fused.map((c) => [c.id, c.hybrid_score]));
    expect(byId["a"]).toBeCloseTo(0.7);
    expect(byId["b"]).toBeCloseTo(0.7 * (0.5 / 0.9) + 0.3);
    expect(fused[0]!.original_rank).toBe(1);
  });
  it("extracts technical query terms", () => {
    expect(queryTerms("Why does getUser() fail with JWT_SECRET?")).toContain("JWT_SECRET");
  });
});

describe("context builder", () => {
  it("dedupes, thresholds and numbers citations", () => {
    const ctx = buildContext([
      chunk("a", { rerank_score: 0.9 }),
      chunk("a2", { rerank_score: 0.8, content: "content a" }),
      chunk("low", { rerank_score: 0.01 }),
    ]);
    expect(ctx.citations.map((c) => c.index)).toEqual([1, 2]);
    expect(ctx.chunks.find((c) => c.id === "low")).toBeUndefined();
    expect(ctx.prompt).toContain("[1] a.py | lines 1-5");
  });
});

describe("reranker", () => {
  it("reorders by model scores and reports execution", async () => {
    vi.mocked(gatewayFetch).mockResolvedValueOnce({ choices: [{ message: { content: '{"scores":[{"index":0,"score":0.1},{"index":1,"score":0.9}]}' } }] });
    const out = await new LlmListwiseReranker("m").rerank("q", [chunk("a"), chunk("b")], 2);
    expect(out.used).toBe(true);
    expect(out.chunks.map((c) => c.id)).toEqual(["b", "a"]);
  });
  it("falls back honestly when the provider fails", async () => {
    vi.mocked(gatewayFetch).mockRejectedValueOnce(new Error("429"));
    const out = await new LlmListwiseReranker("m").rerank("q", [chunk("a"), chunk("b")], 1);
    expect(out.used).toBe(false);
    expect(out.chunks.map((c) => c.id)).toEqual(["a"]);
  });
});

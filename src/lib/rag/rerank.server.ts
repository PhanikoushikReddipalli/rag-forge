/**
 * Reranking stage.
 *
 * A hosted cross-encoder is not reachable from this runtime, so the reranker is
 * a listwise LLM scorer behind a provider-shaped interface. It genuinely
 * re-scores every candidate; if the call fails we return the hybrid order and
 * report `used: false` so the UI never claims reranking that did not happen.
 */
import { RERANKER_CONFIG } from "./config";
import { gatewayFetch } from "./gateway.server";
import type { RetrievedChunk } from "./types";

export interface RerankOutcome {
  chunks: RetrievedChunk[];
  used: boolean;
  model: string | null;
  error?: string;
}

export interface Reranker {
  readonly model: string;
  rerank(query: string, candidates: RetrievedChunk[], topN: number): Promise<RerankOutcome>;
}

export class LlmListwiseReranker implements Reranker {
  readonly model: string;
  constructor(model: string = RERANKER_CONFIG.model) {
    this.model = model;
  }

  async rerank(query: string, candidates: RetrievedChunk[], topN: number): Promise<RerankOutcome> {
    if (candidates.length === 0) return { chunks: [], used: false, model: this.model };

    const listing = candidates
      .map((c, i) => {
        const head = [c.file_path, c.section].filter(Boolean).join(" · ");
        return `[${i}] ${head}\n${c.content.slice(0, 900)}`;
      })
      .join("\n---\n");

    try {
      const json = await gatewayFetch("/chat/completions", {
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a retrieval reranker. Score how well each passage answers the query, from 0 (irrelevant) to 1 (directly answers it). Reply with JSON only: {\"scores\":[{\"index\":0,\"score\":0.0}]}. Score every passage exactly once.",
          },
          { role: "user", content: `Query: ${query}\n\nPassages:\n${listing}` },
        ],
        response_format: { type: "json_object" },
      });

      const raw = json?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { scores?: { index: number; score: number }[] };
      const scores = new Map<number, number>();
      for (const entry of parsed.scores ?? []) {
        if (typeof entry?.index === "number" && typeof entry?.score === "number") {
          scores.set(entry.index, Math.max(0, Math.min(1, entry.score)));
        }
      }
      if (scores.size === 0) throw new Error("Reranker returned no usable scores.");

      const scored = candidates.map((chunk, i) => ({
        ...chunk,
        rerank_score: scores.get(i) ?? 0,
      }));
      scored.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));

      return {
        chunks: scored.slice(0, topN).map((chunk, i) => ({ ...chunk, reranked_rank: i + 1 })),
        used: true,
        model: this.model,
      };
    } catch (error) {
      return {
        chunks: candidates.slice(0, topN).map((chunk, i) => ({ ...chunk, reranked_rank: i + 1 })),
        used: false,
        model: this.model,
        error: error instanceof Error ? error.message : "Reranking failed",
      };
    }
  }
}

export function createReranker(): Reranker | null {
  return RERANKER_CONFIG.enabled ? new LlmListwiseReranker() : null;
}

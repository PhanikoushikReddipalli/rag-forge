/**
 * LLM-as-judge for generation-quality metrics (faithfulness, answer relevance,
 * context relevance). Scores are computed from the actual answer + context.
 */
import { gatewayFetch } from "./gateway.server";

const JUDGE_MODEL = "google/gemini-3.8-flash";

export interface JudgeScores {
  faithfulness: number;
  answer_relevance: number;
  context_relevance: number;
}

const clamp = (n: unknown) => (typeof n === "number" && !Number.isNaN(n) ? Math.max(0, Math.min(1, n)) : 0);

export async function judgeAnswer(params: {
  question: string;
  answer: string;
  context: string[];
  expectedAnswer?: string | null;
}): Promise<JudgeScores> {
  const context = params.context.map((c, i) => `[${i + 1}] ${c.slice(0, 1200)}`).join("\n---\n") || "(no context retrieved)";
  const json = await gatewayFetch("/chat/completions", {
    model: JUDGE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You grade RAG outputs. Return JSON only: {"faithfulness":0-1,"answer_relevance":0-1,"context_relevance":0-1}. faithfulness = fraction of answer claims supported by the context (an honest "not enough information" answer is fully faithful). answer_relevance = how directly the answer addresses the question (use the reference answer if given). context_relevance = fraction of context passages relevant to the question.',
      },
      {
        role: "user",
        content: `Question: ${params.question}\n\nReference answer: ${params.expectedAnswer ?? "(none)"}\n\nContext:\n${context}\n\nAnswer:\n${params.answer}`,
      },
    ],
  });
  const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
  return {
    faithfulness: clamp(parsed.faithfulness),
    answer_relevance: clamp(parsed.answer_relevance),
    context_relevance: clamp(parsed.context_relevance),
  };
}

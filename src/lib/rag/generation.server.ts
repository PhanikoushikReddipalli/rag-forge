/**
 * GenerationService: grounded answer synthesis over the built context.
 * The model never sees the knowledge base — only the selected evidence.
 */
import { GENERATION_CONFIG } from "./config";
import { gatewayFetch } from "./gateway.server";
import type { QueryMode } from "./types";

const BASE_SYSTEM_PROMPT = `You are a technical assistant grounded strictly in the retrieved project knowledge.

Use the provided context to answer the user's question.
Do not invent facts that are not supported by the retrieved context.
If the context is insufficient, explicitly state that the available knowledge base does not contain enough information.
Always provide source citations.

Citation rules:
- Cite with bracketed numbers that match the context blocks, e.g. [1] or [2][3].
- Place citations immediately after the claim they support.
- Never cite a number that is not present in the context.`;

const MODE_PROMPTS: Record<QueryMode, string> = {
  ask: "Answer clearly and concisely for a developer audience. Prefer concrete details from the sources.",
  debug:
    "The user is debugging a failure. Prioritise source code, configuration and troubleshooting notes. Produce: likely causes (ranked), the evidence for each, and concrete checks or fixes.",
  explain:
    "Explain the requested code or architecture step by step: purpose, control flow, key functions and how the pieces interact. Quote short snippets from the context where useful.",
};

export interface GenerationResult {
  answer: string;
  model: string;
}

export class GenerationService {
  readonly model: string;
  constructor(model: string = GENERATION_CONFIG.model) {
    this.model = model;
  }

  async generate(params: {
    query: string;
    context: string;
    mode: QueryMode;
    history?: { role: string; content: string }[];
  }): Promise<GenerationResult> {
    const messages = [
      { role: "system", content: `${BASE_SYSTEM_PROMPT}\n\nMode: ${params.mode.toUpperCase()}. ${MODE_PROMPTS[params.mode]}` },
      ...(params.history ?? []).slice(-6),
      {
        role: "user",
        content: `Retrieved context:\n\n${params.context}\n\n---\nQuestion: ${params.query}`,
      },
    ];

    const json = await gatewayFetch("/chat/completions", {
      model: this.model,
      messages,
      reasoning_effort: GENERATION_CONFIG.reasoningEffort,
    });

    const answer = json?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("The model returned an empty answer.");
    return { answer, model: this.model };
  }
}

export const INSUFFICIENT_CONTEXT_ANSWER =
  "I couldn't find sufficient evidence in the connected knowledge base to answer this confidently.";

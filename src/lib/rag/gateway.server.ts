/**
 * Thin provider boundary around the Lovable AI Gateway.
 *
 * Every model call in RAGForge goes through here, so swapping LLM / embedding
 * providers means replacing this file only.
 */

export const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayError(401, "AI gateway is not configured (missing key).");
  return key;
}

export async function gatewayFetch(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${GATEWAY_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      throw new GatewayError(429, "AI rate limit reached. Please retry in a moment.");
    }
    if (response.status === 402) {
      throw new GatewayError(402, "AI credits exhausted for this workspace.");
    }
    throw new GatewayError(response.status, `AI gateway error ${response.status}: ${text.slice(0, 400)}`);
  }

  return response.json();
}

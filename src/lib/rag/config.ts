/**
 * Central RAG configuration. Every tunable knob of the pipeline lives here so
 * providers/parameters can be swapped without touching pipeline code.
 */

export const EMBEDDING_CONFIG = {
  model: "google/gemini-embedding-2",
  dimensions: 3072,
  /** Max inputs per embeddings request (Gemini caps batches at 100). */
  batchSize: 64,
} as const;

export const GENERATION_CONFIG = {
  model: "openai/gpt-6-astra",
  reasoningEffort: "low",
} as const;

export const RERANKER_CONFIG = {
  /**
   * No hosted cross-encoder is reachable from this runtime, so reranking is
   * implemented as a listwise LLM reranker. It is a real second-pass scoring
   * stage over the retrieved candidates — never a no-op.
   */
  provider: "llm-listwise" as const,
  model: "google/gemini-3.8-flash",
  enabled: true,
};

export const CHUNKING_DEFAULTS = {
  /** Target chunk size in characters. */
  chunkSize: 1400,
  /** Overlap in characters between adjacent chunks of the same unit. */
  chunkOverlap: 160,
  /** Hard ceiling; anything larger is split regardless of structure. */
  maxChars: 2600,
  minChars: 80,
} as const;

export const RETRIEVAL_DEFAULTS = {
  topK: 10,
  candidateK: 20,
  rerankTopN: 5,
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  /** Below this fused score after reranking we refuse to answer. */
  minRelevance: 0.12,
  maxContextChars: 12000,
} as const;

export const SUPPORTED_CODE_EXTENSIONS = [
  "py", "js", "jsx", "ts", "tsx", "java", "cpp", "c", "h",
  "md", "txt", "json", "yaml", "yml", "sql",
] as const;

export const IGNORED_PATH_SEGMENTS = [
  "node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo",
  "vendor", "__pycache__", ".venv", "out", "target",
];

export const IGNORED_FILENAMES = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb",
  "poetry.lock", "Cargo.lock", "composer.lock",
];

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  py: "python", js: "javascript", jsx: "javascript", ts: "typescript",
  tsx: "typescript", java: "java", cpp: "cpp", c: "c", h: "c",
  md: "markdown", txt: "text", json: "json", yaml: "yaml", yml: "yaml",
  sql: "sql", pdf: "pdf",
};

export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const idx = base.lastIndexOf(".");
  return idx === -1 ? "" : base.slice(idx + 1).toLowerCase();
}

export function languageFor(path: string): string | null {
  return LANGUAGE_BY_EXTENSION[extensionOf(path)] ?? null;
}

export function isIgnoredPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => IGNORED_PATH_SEGMENTS.includes(p))) return true;
  const name = parts[parts.length - 1] ?? "";
  if (IGNORED_FILENAMES.includes(name)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".map")) return true;
  return false;
}

export function isSupportedFile(path: string): boolean {
  return (SUPPORTED_CODE_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

/** Cheap token estimate (~4 chars per token) used for budgeting only. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

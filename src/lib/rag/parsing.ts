/**
 * Parsing / metadata extraction stage.
 *
 * Turns raw uploaded or fetched file payloads into `ParsedDocument`s with the
 * metadata later stages depend on (path, language, page structure, titles).
 */
import { languageFor } from "./config";
import type { ParsedDocument } from "./types";

export interface RawFile {
  file_name: string;
  file_path: string;
  content: string;
  /** Only for PDFs, extracted client-side page by page. */
  pages?: { page: number; text: string }[];
  metadata?: Record<string, unknown>;
}

function markdownTitle(content: string): string | null {
  const match = /^#\s+(.+)$/m.exec(content);
  return match ? match[1]!.trim() : null;
}

function headings(content: string): string[] {
  return Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm)).map((m) => m[1]!.trim());
}

export function parseFile(file: RawFile): ParsedDocument {
  const language = languageFor(file.file_path);
  const metadata: Record<string, unknown> = {
    ...(file.metadata ?? {}),
    source_type: file.metadata?.["source_type"] ?? "upload",
    line_count: file.content.split("\n").length,
    char_count: file.content.length,
  };

  if (language === "markdown") {
    metadata["title"] = markdownTitle(file.content);
    metadata["headings"] = headings(file.content);
  }

  if (file.pages && file.pages.length > 0) {
    metadata["page_count"] = file.pages.length;
    metadata["title"] = metadata["title"] ?? file.file_name.replace(/\.pdf$/i, "");
  }

  return {
    file_name: file.file_name,
    file_path: file.file_path,
    content: file.content,
    language: file.pages ? "pdf" : language,
    metadata,
    ...(file.pages ? { pages: file.pages } : {}),
  };
}

export function parseFiles(files: RawFile[]): ParsedDocument[] {
  return files.map(parseFile);
}

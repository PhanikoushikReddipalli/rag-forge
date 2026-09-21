/**
 * Structure-aware chunking.
 *
 * Code is split on function/class boundaries, Markdown on its heading tree,
 * PDFs per page/paragraph and plain text on paragraph boundaries. Fixed-size
 * splitting is only ever a fallback for oversized structural units, and the
 * overlap is applied inside a unit so we never blend unrelated code.
 */
import { CHUNKING_DEFAULTS, estimateTokens } from "./config";
import type { ChunkType, ParsedDocument, RawChunk } from "./types";

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  maxChars?: number;
}

interface Unit {
  content: string;
  chunk_type: ChunkType;
  line_start: number | null;
  line_end: number | null;
  section: string | null;
  page_number: number | null;
}

const DECLARATION_PATTERNS: RegExp[] = [
  /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+\w+/,
  /^\s*(export\s+)?(abstract\s+)?class\s+\w+/,
  /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s*)?\(?[^;]*=>/,
  /^\s*def\s+\w+\s*\(/,
  /^\s*class\s+\w+\s*[:(]/,
  /^\s*(public|private|protected|static|final|\s)*[\w<>,\[\]]+\s+\w+\s*\([^;]*\)\s*\{?\s*$/,
  /^\s*(export\s+)?(interface|type|enum)\s+\w+/,
  /^\s*CREATE\s+(OR\s+REPLACE\s+)?(TABLE|FUNCTION|VIEW|POLICY|INDEX)/i,
];

function declarationType(line: string): ChunkType | null {
  if (/^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(line) || /^\s*class\s+\w+\s*[:(]/.test(line)) {
    return "class";
  }
  for (const pattern of DECLARATION_PATTERNS) {
    if (pattern.test(line)) return "function";
  }
  return null;
}

/** Split source code around top-level declarations, preserving line numbers. */
export function splitCodeIntoUnits(content: string): Unit[] {
  const lines = content.split("\n");
  const boundaries: { line: number; type: ChunkType }[] = [];

  lines.forEach((line, i) => {
    const indent = line.length - line.trimStart().length;
    if (indent > 4) return; // only top-level-ish declarations
    const type = declarationType(line);
    if (type) boundaries.push({ line: i, type });
  });

  if (boundaries.length === 0) {
    return [
      {
        content,
        chunk_type: "block",
        line_start: 1,
        line_end: lines.length,
        section: null,
        page_number: null,
      },
    ];
  }

  const units: Unit[] = [];
  if (boundaries[0]!.line > 0) {
    const head = lines.slice(0, boundaries[0]!.line).join("\n");
    if (head.trim()) {
      units.push({
        content: head,
        chunk_type: "block",
        line_start: 1,
        line_end: boundaries[0]!.line,
        section: "module header",
        page_number: null,
      });
    }
  }

  boundaries.forEach((boundary, i) => {
    const end = i + 1 < boundaries.length ? boundaries[i + 1]!.line : lines.length;
    const body = lines.slice(boundary.line, end).join("\n");
    if (!body.trim()) return;
    units.push({
      content: body,
      chunk_type: boundary.type,
      line_start: boundary.line + 1,
      line_end: end,
      section: (lines[boundary.line] ?? "").trim().slice(0, 120),
      page_number: null,
    });
  });

  return units;
}

/** Split Markdown on its heading tree, keeping the heading path as `section`. */
export function splitMarkdownIntoUnits(content: string): Unit[] {
  const lines = content.split("\n");
  const units: Unit[] = [];
  const headingPath: string[] = [];
  let buffer: string[] = [];
  let bufferStart = 1;
  let inFence = false;

  const flush = (endLine: number) => {
    const text = buffer.join("\n").trim();
    if (text.length >= CHUNKING_DEFAULTS.minChars || (text && units.length === 0)) {
      units.push({
        content: text,
        chunk_type: text.startsWith("```") ? "code" : "section",
        line_start: bufferStart,
        line_end: endLine,
        section: headingPath.join(" > ") || null,
        page_number: null,
      });
    } else if (text && units.length > 0) {
      // Merge trivially small sections into the previous unit.
      const prev = units[units.length - 1]!;
      prev.content += `\n\n${text}`;
      prev.line_end = endLine;
    }
    buffer = [];
    bufferStart = endLine + 1;
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith("```")) inFence = !inFence;
    const heading = !inFence ? /^(#{1,4})\s+(.*)$/.exec(line) : null;
    if (heading) {
      flush(i);
      const level = heading[1]!.length;
      headingPath.length = Math.max(0, level - 1);
      headingPath[level - 1] = heading[2]!.trim();
      bufferStart = i + 1;
      buffer.push(line);
      return;
    }
    buffer.push(line);
  });
  flush(lines.length);

  return units.filter((u) => u.content.trim().length > 0);
}

/** Paragraph-aware splitting for plain text. */
export function splitTextIntoUnits(content: string, pageNumber: number | null = null): Unit[] {
  const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const units: Unit[] = [];
  let current: string[] = [];

  const flush = () => {
    const text = current.join("\n\n").trim();
    if (text) {
      units.push({
        content: text,
        chunk_type: pageNumber ? "page" : "paragraph",
        line_start: null,
        line_end: null,
        section: null,
        page_number: pageNumber,
      });
    }
    current = [];
  };

  for (const paragraph of paragraphs) {
    const projected = [...current, paragraph].join("\n\n").length;
    if (current.length > 0 && projected > CHUNKING_DEFAULTS.chunkSize) flush();
    current.push(paragraph);
  }
  flush();
  return units;
}

/** Fixed-size fallback with controlled overlap, applied within a single unit. */
function splitOversized(unit: Unit, opts: Required<ChunkOptions>): Unit[] {
  if (unit.content.length <= opts.maxChars) return [unit];
  const pieces: Unit[] = [];
  const step = Math.max(200, opts.chunkSize - opts.chunkOverlap);
  const lineOffset = unit.line_start ?? null;

  for (let start = 0; start < unit.content.length; start += step) {
    const slice = unit.content.slice(start, start + opts.chunkSize);
    if (!slice.trim()) continue;
    const linesBefore = lineOffset === null ? null : unit.content.slice(0, start).split("\n").length - 1;
    pieces.push({
      ...unit,
      content: slice,
      line_start: lineOffset === null ? null : lineOffset + (linesBefore ?? 0),
      line_end:
        lineOffset === null ? null : lineOffset + (linesBefore ?? 0) + slice.split("\n").length - 1,
    });
    if (start + opts.chunkSize >= unit.content.length) break;
  }
  return pieces;
}

export function chunkDocument(doc: ParsedDocument, options: ChunkOptions = {}): RawChunk[] {
  const opts: Required<ChunkOptions> = {
    chunkSize: options.chunkSize ?? CHUNKING_DEFAULTS.chunkSize,
    chunkOverlap: options.chunkOverlap ?? CHUNKING_DEFAULTS.chunkOverlap,
    maxChars: options.maxChars ?? CHUNKING_DEFAULTS.maxChars,
  };

  let units: Unit[];
  if (doc.pages && doc.pages.length > 0) {
    units = doc.pages.flatMap((page) => splitTextIntoUnits(page.text, page.page));
  } else if (doc.language === "markdown") {
    units = splitMarkdownIntoUnits(doc.content);
  } else if (doc.language && doc.language !== "text") {
    units = splitCodeIntoUnits(doc.content);
  } else {
    units = splitTextIntoUnits(doc.content);
  }

  const expanded = units.flatMap((u) => splitOversized(u, opts));

  return expanded
    .filter((u) => u.content.trim().length > 0)
    .map((u, index) => ({
      content: u.content.trim(),
      chunk_index: index,
      chunk_type: u.chunk_type,
      file_path: doc.file_path,
      language: doc.language,
      line_start: u.line_start,
      line_end: u.line_end,
      page_number: u.page_number,
      section: u.section,
      token_estimate: estimateTokens(u.content),
    }));
}

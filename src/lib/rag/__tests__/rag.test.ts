import { describe, expect, it } from "vitest";

import { chunkDocument, splitCodeIntoUnits, splitMarkdownIntoUnits } from "../chunking";
import { isIgnoredPath, isSupportedFile, languageFor } from "../config";
import { computeRetrievalMetrics } from "../evaluation";
import { parseFile } from "../parsing";
import { DEMO_FILES } from "../demo-corpus";

describe("parsing & metadata", () => {
  it("detects language and markdown headings", () => {
    const doc = parseFile({ file_name: "a.md", file_path: "docs/a.md", content: "# Title\n\n## Auth\ntext" });
    expect(doc.language).toBe("markdown");
    expect(doc.metadata["title"]).toBe("Title");
    expect(doc.metadata["headings"]).toEqual(["Title", "Auth"]);
  });
  it("filters ignored and unsupported paths", () => {
    expect(isIgnoredPath("node_modules/x/index.js")).toBe(true);
    expect(isIgnoredPath("package-lock.json")).toBe(true);
    expect(isSupportedFile("src/app.tsx")).toBe(true);
    expect(isSupportedFile("logo.png")).toBe(false);
    expect(languageFor("backend/auth.py")).toBe("python");
  });
});

describe("structure-aware chunking", () => {
  it("splits python on function boundaries with line numbers", () => {
    const auth = DEMO_FILES.find((f) => f.file_path === "backend/auth.py")!;
    const units = splitCodeIntoUnits(auth.content);
    const mw = units.find((u) => u.section?.startsWith("def auth_middleware"));
    expect(mw?.chunk_type).toBe("function");
    expect(mw?.line_start).toBeGreaterThan(1);
    expect(auth.content.split("\n")[mw!.line_start! - 1]).toContain("def auth_middleware");
  });
  it("splits markdown by heading path", () => {
    const units = splitMarkdownIntoUnits("# A\n\nintro paragraph that is long enough to stand alone as a chunk of text here.\n\n## B\n\nsection b content that is also long enough to be its own chunk of text.");
    expect(units.map((u) => u.section)).toEqual(["A", "A > B"]);
  });
  it("produces page-aware chunks for PDFs", () => {
    const chunks = chunkDocument({ file_name: "x.pdf", file_path: "x.pdf", content: "", language: "pdf", metadata: {}, pages: [{ page: 1, text: "Page one." }, { page: 2, text: "Page two." }] });
    expect(chunks.map((c) => c.page_number)).toEqual([1, 2]);
  });
  it("splits oversized units with bounded overlap", () => {
    const big = Array.from({ length: 400 }, (_, i) => `line ${i} of a very long block`).join("\n");
    const chunks = chunkDocument({ file_name: "b.txt", file_path: "b.js", content: big, language: "javascript", metadata: {} }, { chunkSize: 1000, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
  });
});

describe("retrieval metrics", () => {
  it("computes recall, precision and MRR", () => {
    const m = computeRetrievalMetrics(["docs/x.md", "backend/auth.py", "a.py", "b.py"], ["backend/auth.py", "docs/authentication.md"]);
    expect(m.hit).toBe(true);
    expect(m.recall_at_k).toBe(0.5);
    expect(m.precision_at_k).toBe(0.25);
    expect(m.mrr).toBe(0.5);
  });
  it("returns zeros when nothing matches", () => {
    expect(computeRetrievalMetrics(["a"], ["b.py"]).mrr).toBe(0);
  });
});

/**
 * Browser-side PDF text extraction (page-aware). The worker runtime cannot run
 * native PDF tooling, so pages are extracted here and sent as structured text.
 */
export async function extractPdfPages(file: File): Promise<{ page: number; text: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: { page: number; text: string }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 14) text += "\n\n";
      else if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) text += "\n";
      text += item.str;
      lastY = y;
    }
    if (text.trim()) pages.push({ page: i, text: text.replace(/[ \t]+/g, " ").trim() });
  }
  if (pages.length === 0) throw new Error(`${file.name}: no extractable text (scanned PDF?).`);
  return pages;
}

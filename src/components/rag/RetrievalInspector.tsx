import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRetrievalLog } from "@/lib/chat.functions";

type Entry = {
  id: string; file_path: string | null; section: string | null; line_start: number | null; line_end: number | null;
  page_number: number | null; semantic_score: number | null; keyword_score: number | null; hybrid_score: number | null;
  rerank_score: number | null; original_rank: number | null; reranked_rank: number | null; matched_terms: string[]; preview: string;
};

const fmt = (n: number | null | undefined, d = 3) => (typeof n === "number" ? n.toFixed(d) : "—");

export function RetrievalInspector({ logId, onClose }: { logId: string | null; onClose: () => void }) {
  const fetchFn = useServerFn(getRetrievalLog);
  const q = useQuery({ queryKey: ["retrieval", logId], queryFn: () => fetchFn({ data: { id: logId! } }), enabled: !!logId });
  const log = q.data;
  const t = (log?.timings ?? {}) as Record<string, number>;

  return (
    <Sheet open={!!logId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Retrieval Inspector</SheetTitle>
          <SheetDescription className="font-mono text-xs">request {log?.request_id ?? "…"}</SheetDescription>
        </SheetHeader>
        {q.isLoading || !log ? (
          <div className="space-y-2 px-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (
          <div className="space-y-5 px-4 pb-8">
            <section className="rounded-md border border-border p-3">
              <div className="text-label">query · mode {log.mode}</div>
              <p className="mt-1 text-sm">{log.query}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                <KV k="embedding model" v={log.embedding_model} />
                <KV k="dimensions" v={log.embedding_dimensions} />
                <KV k="embed time" v={`${t["embedding_ms"] ?? 0} ms`} />
                <KV k="filters" v={Object.entries(log.filters ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}=${String(v).slice(0, 8)}`).join(", ") || "none"} />
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["embedding", t["embedding_ms"]], ["vector search", t["vector_search_ms"]], ["keyword search", t["keyword_search_ms"]],
                ["fusion", t["fusion_ms"]], ["reranking", t["rerank_ms"]], ["context", t["context_ms"]],
                ["generation", t["generation_ms"]], ["total", t["total_ms"]],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-md border border-border p-2.5">
                  <div className="text-label">{k}</div>
                  <div className="mt-0.5 font-mono text-sm">{v ?? 0}<span className="text-muted-foreground"> ms</span></div>
                </div>
              ))}
            </section>

            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${log.reranker_used ? "border-success/40 text-success" : "border-warning/40 text-warning"}`}>
              {log.reranker_used ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
              <div>
                {log.reranker_used ? `Reranking executed with ${log.reranker_model} (listwise LLM reranker).` : "Reranking did NOT run — candidates kept their hybrid order."}
                {!log.reranker_used && log.error_message && <div className="mt-1 font-mono text-xs opacity-80">{log.error_message}</div>}
              </div>
            </div>

            <Tabs defaultValue="hybrid">
              <TabsList className="flex-wrap">
                <TabsTrigger value="semantic">Semantic ({log.semantic_results.length})</TabsTrigger>
                <TabsTrigger value="keyword">Keyword ({log.keyword_results.length})</TabsTrigger>
                <TabsTrigger value="hybrid">Hybrid ({log.hybrid_results.length})</TabsTrigger>
                <TabsTrigger value="rerank">Reranked ({log.reranked_results.length})</TabsTrigger>
                <TabsTrigger value="context">Final context ({log.final_context.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="semantic"><Rows rows={log.semantic_results} cols={[["cosine", (r) => fmt(r.semantic_score)]]} /></TabsContent>
              <TabsContent value="keyword"><Rows rows={log.keyword_results} cols={[["ts_rank", (r) => fmt(r.keyword_score, 4)], ["terms", (r) => r.matched_terms.join(", ") || "—"]]} /></TabsContent>
              <TabsContent value="hybrid">
                <p className="mb-2 text-xs text-muted-foreground">hybrid = 0.7 × norm(semantic) + 0.3 × norm(keyword), min-max normalised per query.</p>
                <Rows rows={log.hybrid_results} cols={[["#", (r) => String(r.original_rank ?? "")], ["sem", (r) => fmt(r.semantic_score)], ["kw", (r) => fmt(r.keyword_score, 4)], ["hybrid", (r) => fmt(r.hybrid_score)]]} />
              </TabsContent>
              <TabsContent value="rerank"><Rows rows={log.reranked_results} cols={[["orig", (r) => String(r.original_rank ?? "—")], ["new", (r) => String(r.reranked_rank ?? "—")], ["rerank", (r) => fmt(r.rerank_score, 2)], ["hybrid", (r) => fmt(r.hybrid_score)]]} /></TabsContent>
              <TabsContent value="context">
                {log.final_context.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No chunk passed the relevance threshold — the model was not called.</p> : (
                  <div className="space-y-2">
                    {(log.final_context as Entry[]).map((r, i) => (
                      <div key={r.id} className="rounded-md border border-border p-3">
                        <div className="font-mono text-xs text-primary">[{i + 1}] {loc(r)}</div>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-muted-foreground">{r.preview}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function loc(r: Entry) {
  return [r.file_path, r.line_start ? `L${r.line_start}-${r.line_end}` : null, r.page_number ? `p.${r.page_number}` : null, r.section].filter(Boolean).join(" · ");
}

function KV({ k, v }: { k: string; v: unknown }) {
  return <div><div className="text-muted-foreground">{k}</div><div className="truncate">{String(v ?? "—")}</div></div>;
}

function Rows({ rows, cols }: { rows: Entry[]; cols: [string, (r: Entry) => string][] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No candidates.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-left font-mono text-muted-foreground">
          <tr><th className="p-2">source</th>{cols.map(([h]) => <th key={h} className="p-2 text-right">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="max-w-[320px] p-2"><div className="truncate font-mono">{loc(r)}</div><div className="mt-1 line-clamp-2 text-muted-foreground">{r.preview}</div></td>
              {cols.map(([h, f]) => <td key={h} className="whitespace-nowrap p-2 text-right font-mono">{f(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

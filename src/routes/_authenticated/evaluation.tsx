import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/AppShell";
import { Metric, Panel, pct } from "@/components/app/Metric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createEvalQuestion, deleteEvalQuestion, listEvalQuestions, listEvalResults, runEvalQuestion } from "@/lib/evaluation.functions";
import { listSources } from "@/lib/sources.functions";
import { average } from "@/lib/rag/evaluation";

export const Route = createFileRoute("/_authenticated/evaluation")({
  head: () => ({
    meta: [
      { title: "RAG Evaluation — RAGForge" },
      { name: "description", content: "Benchmark retrieval (Recall@K, MRR, Precision@K) and generation (faithfulness, relevance)." },
      { property: "og:title", content: "RAG Evaluation — RAGForge" },
      { property: "og:description", content: "Measured, not claimed: evaluate your RAG pipeline." },
    ],
  }),
  component: EvaluationPage,
});

function EvaluationPage() {
  const qc = useQueryClient();
  const listQ = useServerFn(listEvalQuestions);
  const listR = useServerFn(listEvalResults);
  const createQ = useServerFn(createEvalQuestion);
  const deleteQ = useServerFn(deleteEvalQuestion);
  const runQ = useServerFn(runEvalQuestion);
  const listS = useServerFn(listSources);

  const questions = useQuery({ queryKey: ["eval-questions"], queryFn: () => listQ() });
  const results = useQuery({ queryKey: ["eval-results"], queryFn: () => listR() });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => listS() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [form, setForm] = useState({ question: "", expected_answer: "", expected_sources: "", source_id: "all" });

  const latestRunId = (results.data ?? [])[0]?.run_id as string | undefined;
  const latest = (results.data ?? []).filter((r: any) => r.run_id === latestRunId);
  const ok = latest.filter((r: any) => !r.error_message);

  const runAll = async () => {
    const qs = questions.data ?? [];
    if (qs.length === 0) return toast.error("Add at least one evaluation question.");
    const runId = crypto.randomUUID();
    setProgress({ done: 0, total: qs.length });
    let failures = 0;
    for (const [i, q] of qs.entries()) {
      try { await runQ({ data: { run_id: runId, question_id: q.id, k: 5 } }); }
      catch (e) { failures++; toast.error(`Q${i + 1}: ${e instanceof Error ? e.message : "failed"}`); }
      setProgress({ done: i + 1, total: qs.length });
      qc.invalidateQueries({ queryKey: ["eval-results"] });
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ["analytics"] });
    toast.success(`Benchmark finished${failures ? ` with ${failures} failure(s)` : ""}`);
  };

  const add = async () => {
    try {
      await createQ({ data: {
        question: form.question,
        expected_answer: form.expected_answer,
        expected_sources: form.expected_sources.split(",").map((s) => s.trim()).filter(Boolean),
        source_id: form.source_id === "all" ? null : form.source_id,
      } });
      setForm({ question: "", expected_answer: "", expected_sources: "", source_id: form.source_id });
      qc.invalidateQueries({ queryKey: ["eval-questions"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  };

  return (
    <div>
      <PageHeader
        title="RAG Evaluation"
        description="Retrieval metrics are computed from the actual reranked top-5 against your expected sources. Faithfulness and relevance are scored by an LLM judge over the real answer and context."
        actions={<Button onClick={runAll} disabled={!!progress}><Play className="mr-1.5 h-4 w-4" />{progress ? `Running ${progress.done}/${progress.total}` : "Run benchmark"}</Button>}
      />
      <div className="space-y-4 p-6">
        {progress && <Progress value={(progress.done / progress.total) * 100} className="h-1" />}
        {results.isLoading ? <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div> : ok.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No benchmark results yet. Metrics appear after you run the benchmark.</div>
        ) : (
          <>
            <div className="text-label">latest run · {new Date(latest[0].created_at).toLocaleString()} · {ok.length} question(s)</div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
              <Metric label="hit rate" value={pct(average(ok.map((r: any) => (r.hit ? 1 : 0))))} />
              <Metric label="recall@5" value={pct(average(ok.map((r: any) => Number(r.recall_at_k))))} />
              <Metric label="precision@5" value={pct(average(ok.map((r: any) => Number(r.precision_at_k))))} />
              <Metric label="mrr" value={average(ok.map((r: any) => Number(r.mrr))).toFixed(2)} />
              <Metric label="context relevance" value={pct(average(ok.map((r: any) => Number(r.context_relevance))))} sub="LLM-judged" />
              <Metric label="faithfulness" value={pct(average(ok.map((r: any) => Number(r.faithfulness))))} sub="LLM-judged" />
              <Metric label="answer relevance" value={pct(average(ok.map((r: any) => Number(r.answer_relevance))))} sub="LLM-judged" />
              <Metric label="avg latency" value={`${Math.round(average(ok.map((r: any) => r.latency_ms)))} ms`} />
            </div>
          </>
        )}

        <Panel title="evaluation questions">
          {questions.isLoading ? <Skeleton className="h-32" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left font-mono text-xs text-muted-foreground">
                  <tr><th className="p-2">question</th><th className="p-2">expected</th><th className="p-2">retrieved (latest)</th><th className="p-2 text-right">recall</th><th className="p-2 text-right">mrr</th><th className="p-2 text-right">faith.</th><th /></tr>
                </thead>
                <tbody>
                  {(questions.data ?? []).map((q: any) => {
                    const r = latest.find((x: any) => x.question_id === q.id);
                    return (
                      <tr key={q.id} className="border-t border-border align-top">
                        <td className="max-w-xs p-2">{q.question}</td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">{(q.expected_sources ?? []).join(", ")}</td>
                        <td className="max-w-xs p-2 font-mono text-xs">{r?.error_message ? <span className="text-destructive">{r.error_message}</span> : Array.from(new Set(r?.retrieved_sources ?? [])).join(", ") || "—"}</td>
                        <td className="p-2 text-right font-mono">{r && !r.error_message ? pct(Number(r.recall_at_k)) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r && !r.error_message ? Number(r.mrr).toFixed(2) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r && !r.error_message ? pct(Number(r.faithfulness)) : "—"}</td>
                        <td className="p-2"><button aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteQ({ data: { id: q.id } }); qc.invalidateQueries({ queryKey: ["eval-questions"] }); }}><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    );
                  })}
                  {(questions.data ?? []).length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No questions. Loading the demo knowledge base adds four.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="add question">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2"><Label>Question</Label><Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Where is JWT authentication implemented?" /></div>
            <div className="space-y-1.5"><Label>Expected sources (comma separated paths)</Label><Input value={form.expected_sources} onChange={(e) => setForm({ ...form, expected_sources: e.target.value })} placeholder="backend/auth.py, docs/authentication.md" /></div>
            <div className="space-y-1.5"><Label>Scope</Label>
              <Select value={form.source_id} onValueChange={(v) => setForm({ ...form, source_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All sources</SelectItem>{(sources.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label>Expected answer (used by the relevance judge)</Label><Textarea value={form.expected_answer} onChange={(e) => setForm({ ...form, expected_answer: e.target.value })} /></div>
          </div>
          <Button className="mt-3" onClick={add} disabled={!form.question.trim()}><Plus className="mr-1 h-4 w-4" /> Add question</Button>
        </Panel>
      </div>
    </div>
  );
}

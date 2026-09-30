import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/app/AppShell";
import { CHART_TOOLTIP, Metric, Panel, pct } from "@/components/app/Metric";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalytics } from "@/lib/analytics.functions";
import { average } from "@/lib/rag/evaluation";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — RAGForge" },
      { name: "description", content: "Knowledge-base size, query volume, latency and evaluation quality at a glance." },
      { property: "og:title", content: "Dashboard — RAGForge" },
      { property: "og:description", content: "Operational overview of your RAG pipeline." },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function useAnalytics() {
  const fn = useServerFn(getAnalytics);
  return useQuery({ queryKey: ["analytics"], queryFn: () => fn() });
}

function Dashboard() {
  const { data, isLoading, error } = useAnalytics();
  const [scope, setScope] = useScope();

  if (isLoading) return <div><PageHeader title="Dashboard" /><div className="grid gap-3 p-6 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{(error as Error)?.message ?? "Failed to load"}</div>;

  const queries = data.queries.filter((q) => scope === "all" || (scope === "demo" ? q.is_demo : !q.is_demo));
  const ok = queries.filter((q) => q.status !== "error");
  const byDay = groupByDay(queries);
  const modeCounts = ["ask", "debug", "explain"].map((m) => ({ name: m, value: queries.filter((q) => q.mode === m).length }));
  const sourceDist = data.sources.map((s: any) => ({ name: s.name, chunks: s.chunk_count }));
  const evalRuns = groupRuns(data.evaluation);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="All figures are aggregated from your stored sources, retrieval logs and evaluation runs."
        actions={<ScopeToggle scope={scope} setScope={setScope} />}
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="knowledge sources" value={data.totals.sources} sub={`${data.sources.filter((s: any) => s.is_demo).length} demo`} />
          <Metric label="documents" value={data.totals.documents} />
          <Metric label="chunks" value={data.totals.chunks} />
          <Metric label="embeddings" value={data.totals.embeddings} sub="3072-d vectors" />
          <Metric label="queries" value={queries.length} />
          <Metric label="avg retrieval latency" value={`${Math.round(average(ok.map((q) => q.retrieval_ms)))} ms`} />
          <Metric label="avg generation latency" value={`${Math.round(average(ok.map((q) => q.generation_ms)))} ms`} />
          <Metric label="retrieval success" value={queries.length ? pct(queries.filter((q) => q.answered).length / queries.length) : "—"} sub="queries answered with evidence" />
        </div>

        {queries.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No queries recorded yet. Charts populate from real usage.
            <Button size="sm" asChild><Link to="/chat">Ask a question</Link></Button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="queries over time">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={byDay}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP} />
                <Area dataKey="count" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="retrieval vs generation latency (ms)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDay}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="retrieval" stackId="a" fill="var(--chart-2)" />
                <Bar dataKey="generation" stackId="a" fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="query modes">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={modeCounts} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="var(--card)">
                  {modeCounts.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip {...CHART_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 font-mono text-xs">{modeCounts.map((m, i) => <span key={m.name} style={{ color: COLORS[i] }}>{m.name} {m.value}</span>)}</div>
          </Panel>
          <Panel title="source distribution (chunks)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceDist} layout="vertical">
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis type="category" dataKey="name" width={140} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="chunks" fill="var(--chart-3)" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="evaluation performance by run" className="lg:col-span-2">
            {evalRuns.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No evaluation runs yet. <Link to="/evaluation" className="text-primary">Run the benchmark</Link>.</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={evalRuns}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="recall" fill="var(--chart-1)" />
                  <Bar dataKey="mrr" fill="var(--chart-2)" />
                  <Bar dataKey="faithfulness" fill="var(--chart-3)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
export type Scope = "all" | "real" | "demo";
export function useScope() { return useState<Scope>("all"); }
export function ScopeToggle({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 font-mono text-xs">
      {(["all", "real", "demo"] as const).map((s) => (
        <button key={s} onClick={() => setScope(s)} className={`rounded px-2.5 py-1 uppercase ${scope === s ? "bg-accent text-foreground" : "text-muted-foreground"}`}>{s === "all" ? "all data" : `${s} data`}</button>
      ))}
    </div>
  );
}

export function groupByDay(queries: { created_at: string; retrieval_ms: number; generation_ms: number }[]) {
  const map = new Map<string, { day: string; count: number; r: number[]; g: number[] }>();
  for (const q of [...queries].reverse()) {
    const day = q.created_at.slice(5, 10);
    const e = map.get(day) ?? { day, count: 0, r: [], g: [] };
    e.count++; e.r.push(q.retrieval_ms); e.g.push(q.generation_ms);
    map.set(day, e);
  }
  return Array.from(map.values()).map((e) => ({ day: e.day, count: e.count, retrieval: Math.round(average(e.r)), generation: Math.round(average(e.g)) }));
}

export function groupRuns(results: any[]) {
  const map = new Map<string, any[]>();
  for (const r of results) { if (!r.error_message) map.set(r.run_id, [...(map.get(r.run_id) ?? []), r]); }
  return Array.from(map.entries())
    .map(([id, rows]) => ({
      id, created: rows[0].created_at as string,
      label: new Date(rows[0].created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      recall: average(rows.map((r) => Number(r.recall_at_k))),
      mrr: average(rows.map((r) => Number(r.mrr))),
      faithfulness: average(rows.map((r) => Number(r.faithfulness))),
    }))
    .sort((a, b) => a.created.localeCompare(b.created));
}

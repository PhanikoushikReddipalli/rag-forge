import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/app/AppShell";
import { CHART_TOOLTIP, Metric, Panel, pct } from "@/components/app/Metric";
import { Skeleton } from "@/components/ui/skeleton";
import { average } from "@/lib/rag/evaluation";
import { ScopeToggle, groupByDay, useAnalytics, useScope } from "@/components/app/analytics-helpers";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Query Analytics — RAGForge" },
      { name: "description", content: "Latency breakdown, failures, no-context queries, modes and source usage." },
      { property: "og:title", content: "Query Analytics — RAGForge" },
      { property: "og:description", content: "Observability for every RAG request." },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { data, isLoading, error } = useAnalytics();
  const [scope, setScope] = useScope();
  if (isLoading) return <div><PageHeader title="Query Analytics" /><div className="grid gap-3 p-6 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{(error as Error)?.message}</div>;

  const qs = data.queries.filter((q) => scope === "all" || (scope === "demo" ? q.is_demo : !q.is_demo));
  const failed = qs.filter((q) => q.status === "error").length;
  const noContext = qs.filter((q) => q.status === "no_context" || (!q.answered && q.status !== "error")).length;
  const usage = new Map<string, number>();
  qs.forEach((q) => new Set(q.files).forEach((f) => usage.set(f, (usage.get(f) ?? 0) + 1)));
  const topFiles = Array.from(usage.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([file, count]) => ({ file, count }));
  const modes = ["ask", "debug", "explain"].map((m) => ({ mode: m, count: qs.filter((q) => q.mode === m).length, latency: Math.round(average(qs.filter((q) => q.mode === m).map((q) => q.latency_ms))) }));
  const byDay = groupByDay(qs);

  return (
    <div>
      <PageHeader title="Query Analytics" description="Computed from request-id correlated retrieval logs." actions={<ScopeToggle scope={scope} setScope={setScope} />} />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric label="total queries" value={qs.length} />
          <Metric label="avg latency" value={`${Math.round(average(qs.map((q) => q.latency_ms)))} ms`} />
          <Metric label="avg retrieval" value={`${Math.round(average(qs.map((q) => q.retrieval_ms)))} ms`} />
          <Metric label="avg generation" value={`${Math.round(average(qs.map((q) => q.generation_ms)))} ms`} />
          <Metric label="failed" value={failed} sub={qs.length ? pct(failed / qs.length) : undefined} />
          <Metric label="no-context" value={noContext} sub={qs.length ? pct(noContext / qs.length) : undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="latency trend (ms)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDay}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip {...CHART_TOOLTIP} />
                <Line dataKey="retrieval" stroke="var(--chart-2)" dot={false} />
                <Line dataKey="generation" stroke="var(--chart-1)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="query modes">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={modes}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="mode" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="count" fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="most-cited files" className="lg:col-span-2">
            {topFiles.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No source usage recorded yet.</p> : (
              <div className="space-y-1.5">
                {topFiles.map((f) => (
                  <div key={f.file} className="flex items-center gap-3 font-mono text-xs">
                    <span className="w-64 truncate">{f.file}</span>
                    <div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-signal" style={{ width: `${(f.count / topFiles[0]!.count) * 100}%` }} /></div>
                    <span className="w-8 text-right">{f.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

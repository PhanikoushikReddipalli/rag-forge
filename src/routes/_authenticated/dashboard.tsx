import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/app/AppShell";
import { CHART_TOOLTIP, Metric, Panel, pct } from "@/components/app/Metric";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScopeToggle, groupByDay, groupRuns, useAnalytics, useScope } from "@/components/app/analytics-helpers";
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


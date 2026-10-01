import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/analytics.functions";
import { average } from "@/lib/rag/evaluation";
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

export function useAnalytics() {
  const fn = useServerFn(getAnalytics);
  return useQuery({ queryKey: ["analytics"], queryFn: () => fn() });
}

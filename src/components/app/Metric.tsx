import { cn } from "@/lib/utils";

export function Metric({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="text-label">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-medium tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Panel({ title, children, className, right }: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-label">{title}</span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const CHART_TOOLTIP = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)" },
};

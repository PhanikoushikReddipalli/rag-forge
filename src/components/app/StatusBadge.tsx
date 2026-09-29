import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  pending: "border-border text-muted-foreground",
  processing: "border-warning/40 text-warning",
  indexed: "border-success/40 text-success",
  failed: "border-destructive/50 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide", STYLES[status] ?? STYLES["pending"])}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "processing" && "animate-pulse-dot")} />
      {status}
    </span>
  );
}

export function DataBadge({ demo }: { demo: boolean }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", demo ? "border-signal/40 text-signal" : "border-primary/40 text-primary")}>
      {demo ? "demo data" : "real data"}
    </span>
  );
}

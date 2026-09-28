import { cn } from "@/lib/utils";

/** RAGForge mark: an anvil-like stack of three retrieval layers. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" className="fill-primary" />
      <path d="M8 10h16" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 16h12" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      <path d="M13 22h6" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">
        RAG<span className="text-primary">Forge</span>
      </span>
    </span>
  );
}

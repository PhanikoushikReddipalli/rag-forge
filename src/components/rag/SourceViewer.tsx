import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileCode2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DataBadge } from "@/components/app/StatusBadge";
import { CodeView } from "./CodeView";
import { getChunkContext } from "@/lib/chat.functions";
import type { Citation } from "@/lib/rag/types";

export function SourceViewer({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  const fetchFn = useServerFn(getChunkContext);
  const q = useQuery({
    queryKey: ["chunk", citation?.chunk_id],
    queryFn: () => fetchFn({ data: { chunk_id: citation!.chunk_id } }),
    enabled: !!citation,
  });

  const doc = q.data?.document;
  const chunk = q.data?.chunk;
  const isCode = !!chunk?.line_start && doc?.language !== "pdf";
  const lines = doc?.content.split("\n") ?? [];
  const from = chunk?.line_start ? Math.max(1, chunk.line_start - 6) : 1;
  const to = chunk?.line_end ? Math.min(lines.length, chunk.line_end + 6) : lines.length;

  return (
    <Sheet open={!!citation} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono text-sm">
            <FileCode2 className="h-4 w-4 text-primary" /> [{citation?.index}] {citation?.file_path}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              {q.data?.source && <><span>{q.data.source.name}</span><span>· {q.data.source.source_type}</span><DataBadge demo={!!q.data.source.is_demo} /></>}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 font-mono text-xs sm:grid-cols-4">
            <Meta k="file" v={doc?.file_name ?? citation?.file_path} />
            <Meta k="language" v={citation?.language} />
            <Meta k={citation?.page_number ? "page" : "lines"} v={citation?.page_number ? String(citation.page_number) : citation?.line_start ? `${citation.line_start}–${citation.line_end}` : "—"} />
            <Meta k="section" v={citation?.section} />
          </div>
          {q.isLoading ? <Skeleton className="h-80 w-full" /> : q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : isCode && doc ? (
            <CodeView code={lines.slice(from - 1, to).join("\n")} language={doc.language} startLine={from} highlight={[chunk!.line_start!, chunk!.line_end ?? chunk!.line_start!]} />
          ) : (
            <div>
              <div className="text-label mb-2">retrieved chunk</div>
              <pre className="whitespace-pre-wrap rounded-md border border-primary/40 bg-primary/5 p-3 font-mono text-[12.5px] leading-5">{chunk?.content ?? citation?.content}</pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><div className="text-muted-foreground">{k}</div><div className="truncate">{v || "—"}</div></div>;
}

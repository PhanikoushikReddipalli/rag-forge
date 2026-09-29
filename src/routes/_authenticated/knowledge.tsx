import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, FileUp, Github, Loader2, MessageSquareCode, RefreshCw, Sparkle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { PageHeader } from "@/components/app/AppShell";
import { DataBadge, StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useIngestion } from "@/hooks/use-ingestion";
import { extractPdfPages } from "@/lib/pdf-extract";
import { createDemoSource, createSource, deleteSource, listSources, resetSource, type UploadedFileInput } from "@/lib/sources.functions";

export const Route = createFileRoute("/_authenticated/knowledge")({
  validateSearch: (s: Record<string, unknown>): { demo?: boolean } => (s["demo"] ? { demo: true } : {}),
  head: () => ({
    meta: [
      { title: "Knowledge Base — RAGForge" },
      { name: "description", content: "Connect GitHub repositories and upload PDF, Markdown and text documentation." },
      { property: "og:title", content: "Knowledge Base — RAGForge" },
      { property: "og:description", content: "Manage and index your technical knowledge sources." },
    ],
  }),
  component: KnowledgePage,
});

const STAGES = ["parsing", "chunking", "embedding", "indexing", "complete"];

function KnowledgePage() {
  const { demo } = Route.useSearch();
  const qc = useQueryClient();
  const listFn = useServerFn(listSources);
  const createFn = useServerFn(createSource);
  const demoFn = useServerFn(createDemoSource);
  const deleteFn = useServerFn(deleteSource);
  const resetFn = useServerFn(resetSource);
  const { run, running } = useIngestion();
  const [dialog, setDialog] = useState<null | "github" | "upload">(null);

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: () => listFn(),
    refetchInterval: (q) => ((q.state.data ?? []).some((s: any) => s.status === "processing") ? 2000 : false),
  });

  const startDemo = useMutation({
    mutationFn: async () => {
      const src = await demoFn();
      qc.invalidateQueries({ queryKey: ["sources"] });
      if (src.status !== "indexed") await run(src.id, { kind: "demo" });
      return src;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create demo"),
  });

  const autoDemo = useRef(false);
  useEffect(() => {
    if (demo && !autoDemo.current && sources.data && !sources.data.some((s: any) => s.is_demo)) {
      autoDemo.current = true;
      startDemo.mutate();
    }
  }, [demo, sources.data, startDemo]);

  const reindex = async (s: any) => {
    if (s.source_type !== "github" && s.source_type !== "demo") {
      toast.info("Uploaded sources must be re-uploaded to re-index.");
      return;
    }
    await resetFn({ data: { id: s.id } });
    qc.invalidateQueries({ queryKey: ["sources"] });
    await run(s.id, { kind: s.source_type === "demo" ? "demo" : "github" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this source and all of its chunks?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["sources"] });
    toast.success("Source deleted");
  };

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Sources are parsed, structure-aware chunked, embedded and indexed for hybrid retrieval."
        actions={
          <>
            <Button variant="outline" onClick={() => startDemo.mutate()} disabled={startDemo.isPending}>
              <Sparkle className="mr-1.5 h-4 w-4" /> Load demo
            </Button>
            <Button variant="outline" onClick={() => setDialog("upload")}><FileUp className="mr-1.5 h-4 w-4" /> Upload</Button>
            <Button onClick={() => setDialog("github")}><Github className="mr-1.5 h-4 w-4" /> Add repository</Button>
          </>
        }
      />
      <div className="p-6">
        {sources.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : sources.error ? (
          <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{(sources.error as Error).message}</div>
        ) : (sources.data ?? []).length === 0 ? (
          <EmptyState onDemo={() => startDemo.mutate()} onGithub={() => setDialog("github")} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {(sources.data ?? []).map((s: any) => (
              <div key={s.id} className="flex flex-col gap-3 border-b border-border bg-card p-4 last:border-b-0 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] uppercase text-muted-foreground">{s.source_type}</span>
                    <DataBadge demo={s.is_demo} />
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                    <span>{s.document_count} docs</span>
                    <span>{s.chunk_count} chunks</span>
                    <span>created {formatDistanceToNow(new Date(s.created_at))} ago</span>
                    <span>{s.last_indexed_at ? `indexed ${formatDistanceToNow(new Date(s.last_indexed_at))} ago` : "not indexed"}</span>
                    {s.source_url && <span className="truncate">{s.source_url}</span>}
                  </div>
                  {s.status === "processing" && (
                    <div className="mt-3 max-w-xl">
                      <div className="mb-1.5 flex gap-3 font-mono text-[11px]">
                        {STAGES.map((st) => (
                          <span key={st} className={st === s.stage ? "text-primary" : STAGES.indexOf(st) < STAGES.indexOf(s.stage) ? "text-foreground" : "text-muted-foreground/50"}>{st}</span>
                        ))}
                      </div>
                      <Progress value={s.progress} className="h-1" />
                    </div>
                  )}
                  {s.status === "failed" && s.error_message && <p className="mt-2 text-xs text-destructive">{s.error_message}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {running[s.id] && <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />}
                  {s.status === "indexed" && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/chat" search={{ source: s.id }}><MessageSquareCode className="mr-1 h-4 w-4" /> Ask</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => reindex(s)} disabled={running[s.id]} aria-label="Re-index"><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GithubDialog
        open={dialog === "github"}
        onClose={() => setDialog(null)}
        onSubmit={async (url, chunkSize, overlap) => {
          const name = url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "");
          const src = await createFn({ data: { name, source_type: "github", source_url: url, chunk_size: chunkSize, chunk_overlap: overlap } });
          setDialog(null);
          qc.invalidateQueries({ queryKey: ["sources"] });
          void run(src.id, { kind: "github" });
        }}
      />
      <UploadDialog
        open={dialog === "upload"}
        onClose={() => setDialog(null)}
        onSubmit={async (name, type, files) => {
          const src = await createFn({ data: { name, source_type: type, source_url: null } });
          setDialog(null);
          qc.invalidateQueries({ queryKey: ["sources"] });
          void run(src.id, { kind: "documents", files });
        }}
      />
    </div>
  );
}

function EmptyState({ onDemo, onGithub }: { onDemo: () => void; onGithub: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <Database className="h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 font-semibold">Your knowledge base is empty</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">Connect a GitHub repository, upload documentation, or load the TaskFlow demo project to try the full pipeline.</p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onDemo}>Load demo project</Button>
        <Button onClick={onGithub}>Add repository</Button>
      </div>
    </div>
  );
}

function GithubDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (url: string, size: number, overlap: number) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [size, setSize] = useState(1400);
  const [overlap, setOverlap] = useState(160);
  const [busy, setBusy] = useState(false);
  const valid = /^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/.test(url.trim());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add GitHub repository</DialogTitle>
          <DialogDescription>Public repositories. Vendored, build and lock files are skipped; up to 120 supported source files are indexed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Repository URL</Label>
            <Input placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} />
            {url && !valid && <p className="text-xs text-destructive">Enter a URL like https://github.com/owner/repo</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Chunk size (chars)</Label><Input type="number" min={400} max={2400} value={size} onChange={(e) => setSize(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Overlap (chars)</Label><Input type="number" min={0} max={400} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try { await onSubmit(url.trim(), size, overlap); setUrl(""); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Could not add repository"); }
              finally { setBusy(false); }
            }}
          >
            {busy ? "Adding…" : "Index repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (name: string, type: "pdf" | "markdown" | "txt", files: UploadedFileInput[]) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const payload: UploadedFileInput[] = [];
      for (const file of files) {
        if (file.size > 8_000_000) throw new Error(`${file.name} is larger than 8 MB.`);
        if (/\.pdf$/i.test(file.name)) {
          const pages = await extractPdfPages(file);
          payload.push({ file_name: file.name, file_path: file.name, content: pages.map((p) => p.text).join("\n\n"), pages });
        } else {
          payload.push({ file_name: file.name, file_path: file.name, content: await file.text() });
        }
      }
      const type = files.every((f) => /\.pdf$/i.test(f.name)) ? "pdf" : files.every((f) => /\.md$/i.test(f.name)) ? "markdown" : "txt";
      await onSubmit(name || files.map((f) => f.name).join(", ").slice(0, 60), type, payload);
      setFiles([]);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>PDF, Markdown, TXT or source files. PDFs are parsed page by page in your browser.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Source name</Label><Input placeholder="e.g. Platform docs" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Input type="file" multiple accept=".pdf,.md,.txt,.py,.js,.jsx,.ts,.tsx,.java,.cpp,.c,.h,.json,.yaml,.yml,.sql" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <p className="font-mono text-xs text-muted-foreground">{files.length} file(s) selected</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={files.length === 0 || busy} onClick={submit}>{busy ? "Parsing…" : "Upload & index"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

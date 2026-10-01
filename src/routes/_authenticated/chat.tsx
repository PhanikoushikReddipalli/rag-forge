import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bug, Check, Copy, Eraser, FileText, Lightbulb, MessageSquarePlus, RotateCcw, ScanSearch, Send, Trash2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand/Logo";
import { AnswerMarkdown } from "@/components/rag/AnswerMarkdown";
import { RetrievalInspector } from "@/components/rag/RetrievalInspector";
import { SourceViewer } from "@/components/rag/SourceViewer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { clearConversation, deleteConversation, getConversation, listConversations, runQuery } from "@/lib/chat.functions";
import { listSources } from "@/lib/sources.functions";
import type { Citation, QueryMode } from "@/lib/rag/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: (s: Record<string, unknown>): { c?: string; source?: string } => ({
    ...(typeof s["c"] === "string" ? { c: s["c"] } : {}),
    ...(typeof s["source"] === "string" ? { source: s["source"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Chat — RAGForge" },
      { name: "description", content: "Ask, debug and explain questions grounded in your indexed knowledge base." },
      { property: "og:title", content: "Chat — RAGForge" },
      { property: "og:description", content: "Citation-grounded technical Q&A." },
    ],
  }),
  component: ChatPage,
});

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: string | null;
  citations: Citation[];
  retrieval_log_id?: string | null;
  grounded?: boolean | null;
  pending?: boolean;
  error?: boolean;
}

const MODES: { id: QueryMode; label: string; icon: typeof Bug; hint: string }[] = [
  { id: "ask", label: "Ask", icon: Lightbulb, hint: "General knowledge-base Q&A" },
  { id: "debug", label: "Debug", icon: Bug, hint: "Ranked causes, evidence and fixes" },
  { id: "explain", label: "Explain", icon: Wand2, hint: "Step-by-step code walkthrough" },
];

const SUGGESTIONS: { q: string; mode: QueryMode }[] = [
  { q: "How does authentication work?", mode: "ask" },
  { q: "Why might login return 401 after deployment?", mode: "debug" },
  { q: "Explain how the authentication middleware works.", mode: "explain" },
];

function ChatPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/chat" });
  const qc = useQueryClient();
  const listConvFn = useServerFn(listConversations);
  const getConvFn = useServerFn(getConversation);
  const queryFn = useServerFn(runQuery);
  const deleteFn = useServerFn(deleteConversation);
  const clearFn = useServerFn(clearConversation);
  const listSourcesFn = useServerFn(listSources);

  const [mode, setMode] = useState<QueryMode>("ask");
  const [input, setInput] = useState("");
  const [sourceId, setSourceId] = useState<string>(search.source ?? "all");
  const [language, setLanguage] = useState<string>("all");
  const [fileType, setFileType] = useState<string>("all");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ["conversations"], queryFn: () => listConvFn() });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => listSourcesFn() });
  const indexed = (sources.data ?? []).filter((s: any) => s.status === "indexed");

  const conv = useQuery({
    queryKey: ["conversation", search.c],
    queryFn: () => getConvFn({ data: { id: search.c! } }),
    enabled: !!search.c,
  });

  useEffect(() => {
    if (!search.c) setMessages([]);
    else if (conv.data) setMessages(conv.data.messages.map((m: any) => ({ ...m, citations: m.citations ?? [] })));
  }, [search.c, conv.data]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { textRef.current?.focus(); }, [search.c]);

  const send = useMutation({
    mutationFn: async (vars: { text: string; mode: QueryMode }) =>
      queryFn({
        data: {
          conversation_id: search.c ?? null,
          query: vars.text,
          mode: vars.mode,
          filters: {
            source_id: sourceId === "all" ? null : sourceId,
            language: language === "all" ? null : language,
            file_type: fileType === "all" ? null : fileType,
          },
        },
      }),
    onMutate: ({ text, mode: m }) => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: text, mode: m, citations: [] },
        { id: "pending", role: "assistant", content: "", citations: [], pending: true },
      ]);
    },
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "pending"),
        { id: res.message_id, role: "assistant", content: res.answer, citations: res.citations, retrieval_log_id: res.retrieval_log_id, grounded: res.grounded, mode },
      ]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      if (!search.c) navigate({ search: (p) => ({ ...p, c: res.conversation_id }), replace: true });
      else qc.setQueryData(["conversation", search.c], undefined);
      textRef.current?.focus();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Request failed";
      setMessages((prev) => [...prev.filter((m) => m.id !== "pending"), { id: `e-${Date.now()}`, role: "assistant", content: message, citations: [], error: true }]);
      toast.error(message);
    },
  });

  const submit = (text = input, m = mode) => {
    if (!text.trim() || send.isPending) return;
    if (indexed.length === 0) { toast.error("Index a knowledge source first."); return; }
    setInput("");
    send.mutate({ text: text.trim(), mode: m });
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) submit(lastUser.content, (lastUser.mode as QueryMode) ?? mode);
  };

  const languages = ["python", "typescript", "javascript", "markdown", "java", "sql", "pdf", "text"];

  return (
    <div className="flex h-full">
      {/* Conversation history */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex">
        <div className="p-3">
          <Button variant="outline" className="w-full justify-start" onClick={() => navigate({ search: (p) => (p.source ? { source: p.source } : {}) })}>
            <MessageSquarePlus className="mr-2 h-4 w-4" /> New conversation
          </Button>
        </div>
        <div className="text-label px-4 pb-2">history</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="mb-1 h-8" />) : (conversations.data ?? []).map((c: any) => (
            <div key={c.id} className={cn("group flex items-center rounded-md", search.c === c.id ? "bg-accent" : "hover:bg-accent/60")}>
              <button className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm" onClick={() => navigate({ search: (p) => ({ ...p, c: c.id }) })}>{c.title}</button>
              <button
                className="mr-1 hidden p-1 text-muted-foreground hover:text-destructive group-hover:block"
                aria-label="Delete conversation"
                onClick={async () => {
                  await deleteFn({ data: { id: c.id } });
                  qc.invalidateQueries({ queryKey: ["conversations"] });
                  if (search.c === c.id) navigate({ search: (p) => (p.source ? { source: p.source } : {}) });
                }}
              ><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {conversations.data?.length === 0 && <p className="px-3 text-xs text-muted-foreground">No conversations yet.</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-label mr-1">filters</span>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="All sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {indexed.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any language</SelectItem>
              {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fileType} onValueChange={setFileType}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any file type</SelectItem>
              {["py", "ts", "tsx", "js", "md", "txt", "sql", "json", "yaml", "pdf"].map((f) => <SelectItem key={f} value={f}>.{f}</SelectItem>)}
            </SelectContent>
          </Select>
          {search.c && (
            <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={async () => {
              await clearFn({ data: { id: search.c! } });
              setMessages([]);
              qc.invalidateQueries({ queryKey: ["conversation", search.c] });
            }}><Eraser className="mr-1 h-3.5 w-3.5" /> Clear</Button>
          )}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {search.c && conv.isLoading ? (
              <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : messages.length === 0 ? (
              <div className="pt-16 text-center">
                <LogoMark className="mx-auto h-10 w-10" />
                <h2 className="mt-4 text-lg font-semibold">Ask your knowledge base</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {indexed.length === 0 ? "No indexed sources yet — add one in Knowledge, or load the demo." : `Searching ${indexed.length} indexed source(s) with hybrid retrieval + reranking.`}
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.q} onClick={() => { setMode(s.mode); submit(s.q, s.mode); }} className="rounded-lg border border-border bg-card p-3 text-left text-sm hover:border-primary/50">
                      <span className="text-label">{s.mode}</span>
                      <div className="mt-1">{s.q}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) => (
                  <MessageRow key={m.id} m={m} isLast={i === messages.length - 1} onCite={setCitation} onInspect={setInspect} onRegenerate={regenerate} />
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex gap-1">
              {MODES.map((md) => (
                <button key={md.id} onClick={() => setMode(md.id)} title={md.hint}
                  className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wide", mode === md.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  <md.icon className="h-3.5 w-3.5" />{md.label}
                </button>
              ))}
            </div>
            <div className="relative rounded-lg border border-input bg-card focus-within:border-primary/60">
              <Textarea
                ref={textRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Ask anything about your technical knowledge base..."
                className="min-h-[72px] resize-none border-0 bg-transparent pr-14 focus-visible:ring-0"
              />
              <Button size="icon" className="absolute bottom-2.5 right-2.5 h-8 w-8" onClick={() => submit()} disabled={!input.trim() || send.isPending} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SourceViewer citation={citation} onClose={() => setCitation(null)} />
      <RetrievalInspector logId={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}

function MessageRow({ m, isLast, onCite, onInspect, onRegenerate }: { m: Msg; isLast: boolean; onCite: (c: Citation) => void; onInspect: (id: string) => void; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          {m.mode && <div className="text-label mb-1 text-right">{m.mode}</div>}
          <div className="whitespace-pre-wrap">{m.content}</div>
        </div>
      </div>
    );
  }
  if (m.pending) {
    return (
      <div className="space-y-2">
        <div className="flex gap-3 font-mono text-xs text-muted-foreground">
          {["embedding", "retrieving", "reranking", "generating"].map((s, i) => (
            <span key={s} className="animate-pulse-dot" style={{ animationDelay: `${i * 0.25}s` }}>{s}…</span>
          ))}
        </div>
        <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  return (
    <div className="group">
      {m.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{m.content}</div>
      ) : (
        <>
          {m.grounded === false && (
            <div className="mb-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
              Insufficient evidence. Open <b>Inspect Retrieval</b> to see the scores and sources searched; consider adding more documentation to the knowledge base.
            </div>
          )}
          <AnswerMarkdown content={m.content} citations={m.citations} onCite={onCite} />
          {m.citations.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-label">sources</div>
              {m.citations.map((c) => (
                <button key={c.index} onClick={() => onCite(c)} className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left font-mono text-xs hover:border-primary/50">
                  <span className="text-primary">[{c.index}]</span>
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{c.file_path}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {c.line_start ? `L${c.line_start}–${c.line_end}` : c.page_number ? `page ${c.page_number}` : c.section?.slice(0, 40)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="mt-2 flex gap-1">
        {m.retrieval_log_id && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onInspect(m.retrieval_log_id!)}>
            <ScanSearch className="mr-1 h-3.5 w-3.5" /> Inspect Retrieval
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Copy
        </Button>
        {isLast && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onRegenerate}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Regenerate</Button>}
      </div>
    </div>
  );
}

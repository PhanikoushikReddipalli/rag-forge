import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Binary, FileSearch, FlaskConical, GitMerge, Layers, Quote, ScanSearch } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAGForge — Understand Your Codebase. Ask Your Knowledge Base." },
      {
        name: "description",
        content: "RAGForge turns repositories and technical docs into a citation-grounded engineering assistant with hybrid retrieval, reranking and evaluation.",
      },
      { property: "og:title", content: "RAGForge — Citation-grounded RAG for engineers" },
      { property: "og:description", content: "Hybrid retrieval, reranking, source citations and a transparent retrieval inspector." },
    ],
  }),
  component: Landing,
});

const PIPELINE = ["Ingest", "Chunk", "Embed", "Retrieve", "Rerank", "Generate", "Cite"];

const FEATURES = [
  { icon: GitMerge, title: "Hybrid Retrieval", body: "pgvector cosine similarity fused with Postgres full-text rank. Scores are min-max normalised and weighted 0.7 / 0.3." },
  { icon: Layers, title: "Intelligent Chunking", body: "Code splits on functions and classes, Markdown on its heading tree, PDFs per page. Line numbers and sections travel with every chunk." },
  { icon: Binary, title: "Reranking", body: "A second-pass reranker rescored the fused candidates down to the top five — and the UI tells you when it did not run." },
  { icon: Quote, title: "Source Citations", body: "Every claim carries a numbered citation that opens the exact file, lines, page or section it came from." },
  { icon: ScanSearch, title: "Retrieval Inspector", body: "See semantic, keyword, hybrid and reranked candidates with their scores, plus per-stage latency for each answer." },
  { icon: FlaskConical, title: "RAG Evaluation", body: "Hit rate, Recall@K, Precision@K and MRR from real retrieval, plus judged faithfulness and relevance." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/knowledge">Open app</Link></Button>
        </div>
      </header>

      <section className="bg-grid border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-label">Retrieval-augmented generation · for engineers</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Understand Your Codebase. <span className="text-primary">Ask Your Knowledge Base.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            RAGForge transforms repositories, documentation and technical knowledge into a searchable, citation-grounded engineering assistant.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild className="glow-primary"><Link to="/knowledge">Create Knowledge Base <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/knowledge" search={{ demo: true }}>Explore Demo</Link></Button>
          </div>

          <div className="mt-16 rounded-xl border border-border bg-card/80 p-5">
            <div className="text-label mb-4">pipeline</div>
            <div className="flex flex-wrap items-center gap-2">
              {PIPELINE.map((stage, i) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className="rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-sm">
                    <span className="mr-2 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{stage}
                  </div>
                  {i < PIPELINE.length - 1 && <div className="animate-flow h-0.5 w-6" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><FileSearch className="h-4 w-4" /> RAGForge</span>
          <span className="font-mono text-xs">retrieve → rerank → generate → cite</span>
        </div>
      </footer>
    </div>
  );
}

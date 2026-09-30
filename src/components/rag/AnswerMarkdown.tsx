import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeView } from "./CodeView";
import type { Citation } from "@/lib/rag/types";

/** Markdown answer renderer; `[n]` citation markers become clickable chips. */
export function AnswerMarkdown({ content, citations, onCite }: { content: string; citations: Citation[]; onCite: (c: Citation) => void }) {
  const linked = content.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (citations.some((c) => c.index === Number(n)) ? `[${n}](#cite-${n})` : m));
  return (
    <div className="prose-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const match = href?.match(/^#cite-(\d+)$/);
            if (match) {
              const c = citations.find((x) => x.index === Number(match[1]));
              return (
                <button type="button" onClick={() => c && onCite(c)} className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 align-super font-mono text-[10px] text-primary hover:bg-primary hover:text-primary-foreground" title={c?.file_path ?? ""}>
                  {children}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            const text = String(children);
            if (!lang && !text.includes("\n")) return <code>{children}</code>;
            return <CodeView code={text} language={lang ?? null} />;
          },
          pre: ({ children }) => <div className="my-3">{children}</div>,
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}

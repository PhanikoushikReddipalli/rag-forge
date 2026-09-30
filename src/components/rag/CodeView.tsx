import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";

const PRISM_LANG: Record<string, string> = {
  python: "python", javascript: "javascript", typescript: "tsx", java: "java",
  cpp: "cpp", c: "c", json: "json", yaml: "yaml", sql: "sql", markdown: "markdown",
};

/** Syntax-highlighted code with absolute line numbers and a highlighted range. */
export function CodeView({
  code, language, startLine = 1, highlight,
}: { code: string; language: string | null; startLine?: number; highlight?: [number, number] | null }) {
  return (
    <Highlight code={code.replace(/\n$/, "")} language={PRISM_LANG[language ?? ""] ?? "markup"} theme={themes.vsDark}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className="overflow-x-auto rounded-md border border-border bg-background py-2 text-[12.5px] leading-5">
          {tokens.map((line, i) => {
            const n = startLine + i;
            const hit = highlight && n >= highlight[0] && n <= highlight[1];
            const { key: _k, ...lineProps } = getLineProps({ line }) as any;
            return (
              <div key={i} {...lineProps} className={cn("flex px-2", hit && "bg-primary/12 border-l-2 border-primary")} style={undefined}>
                <span className="mr-4 w-9 shrink-0 select-none text-right text-muted-foreground/60">{n}</span>
                <span>
                  {line.map((token, j) => {
                    const { key: _tk, ...tp } = getTokenProps({ token }) as any;
                    return <span key={j} {...tp} />;
                  })}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}

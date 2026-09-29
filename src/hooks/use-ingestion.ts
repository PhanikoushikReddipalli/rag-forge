import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { embedStep, ingestDemo, ingestDocuments, ingestGithub, type UploadedFileInput } from "@/lib/sources.functions";

export type IngestKind = { kind: "github" } | { kind: "demo" } | { kind: "documents"; files: UploadedFileInput[] };

/**
 * Drives ingestion: one call for parse+chunk+store, then repeated embedding
 * batches until every chunk has a vector. Progress is persisted server-side.
 */
export function useIngestion() {
  const qc = useQueryClient();
  const ingestGithubFn = useServerFn(ingestGithub);
  const ingestDocsFn = useServerFn(ingestDocuments);
  const ingestDemoFn = useServerFn(ingestDemo);
  const embedFn = useServerFn(embedStep);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const run = useCallback(
    async (sourceId: string, job: IngestKind) => {
      setRunning((r) => ({ ...r, [sourceId]: true }));
      const refresh = () => qc.invalidateQueries({ queryKey: ["sources"] });
      try {
        if (job.kind === "github") await ingestGithubFn({ data: { source_id: sourceId } });
        else if (job.kind === "demo") await ingestDemoFn({ data: { source_id: sourceId } });
        else await ingestDocsFn({ data: { source_id: sourceId, files: job.files } });
        refresh();

        let guard = 0;
        while (guard++ < 200) {
          const res = await embedFn({ data: { source_id: sourceId } });
          refresh();
          if (res.remaining === 0) break;
        }
        toast.success("Knowledge source indexed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ingestion failed");
      } finally {
        refresh();
        qc.invalidateQueries({ queryKey: ["analytics"] });
        setRunning((r) => ({ ...r, [sourceId]: false }));
      }
    },
    [embedFn, ingestDemoFn, ingestDocsFn, ingestGithubFn, qc],
  );

  return { run, running };
}

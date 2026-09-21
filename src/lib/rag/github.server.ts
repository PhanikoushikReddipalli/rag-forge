/**
 * GitHub ingestion source: resolves a repository URL, walks its tree and pulls
 * the supported text files (ignoring vendored/generated paths).
 */
import { isIgnoredPath, isSupportedFile } from "./config";
import type { RawFile } from "./parsing";

export interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

const MAX_FILES = 120;
const MAX_FILE_BYTES = 180_000;

export function parseRepoUrl(url: string): RepoRef {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match = /^https?:\/\/(www\.)?github\.com\/([^/]+)\/([^/]+)(\/tree\/([^/]+))?/.exec(cleaned);
  if (!match) {
    throw new Error("That does not look like a GitHub repository URL (https://github.com/owner/repo).");
  }
  return { owner: match[2]!, repo: match[3]!, ...(match[5] ? { branch: match[5] } : {}) };
}

function headers(): Record<string, string> {
  const token = process.env["GITHUB_TOKEN"];
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "RAGForge",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404) throw new Error("Repository not found, or it is private.");
  if (response.status === 403) {
    throw new Error("GitHub rate limit reached. Add a GitHub token or try again later.");
  }
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
  return response.json();
}

export async function fetchRepositoryFiles(
  ref: RepoRef,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ files: RawFile[]; branch: string }> {
  const meta = await githubJson(`https://api.github.com/repos/${ref.owner}/${ref.repo}`);
  const branch = ref.branch ?? meta.default_branch ?? "main";

  const tree = await githubJson(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`,
  );

  const candidates = (tree.tree ?? [])
    .filter((node: any) => node.type === "blob")
    .filter((node: any) => !isIgnoredPath(node.path))
    .filter((node: any) => isSupportedFile(node.path))
    .filter((node: any) => (node.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES);

  const files: RawFile[] = [];
  const concurrency = 6;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const loaded = await Promise.all(
      batch.map(async (node: any) => {
        const response = await fetch(
          `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${node.path}`,
          { headers: { "User-Agent": "RAGForge" } },
        );
        if (!response.ok) return null;
        const content = await response.text();
        if (!content.trim()) return null;
        return {
          file_name: node.path.split("/").pop()!,
          file_path: node.path,
          content,
          metadata: {
            source_type: "github",
            repository: `${ref.owner}/${ref.repo}`,
            branch,
            url: `https://github.com/${ref.owner}/${ref.repo}/blob/${branch}/${node.path}`,
          },
        } satisfies RawFile;
      }),
    );
    files.push(...loaded.filter((f): f is RawFile => f !== null));
    onProgress?.(files.length, candidates.length);
  }

  if (files.length === 0) throw new Error("No supported text files were found in that repository.");
  return { files, branch };
}

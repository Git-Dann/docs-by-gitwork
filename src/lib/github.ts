const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export class GitHubRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubRequestError";
    this.code = code;
  }
}

export function githubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "foundry-by-gitwork",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    const message = body || `GitHub request failed with status ${response.status}.`;

    if (response.status === 404) {
      throw new GitHubRequestError("GITHUB_NOT_FOUND", "GitHub resource not found.");
    }

    if (response.status === 403) {
      throw new GitHubRequestError(
        "GITHUB_RATE_LIMITED",
        "GitHub API is temporarily rate limited. Try again shortly or configure GITHUB_TOKEN.",
      );
    }

    throw new GitHubRequestError("GITHUB_REQUEST_FAILED", message);
  }

  return response.json() as Promise<T>;
}

export async function safeGithubRequest<T>(path: string, fallback: T): Promise<T> {
  try {
    return await githubRequest<T>(path);
  } catch {
    return fallback;
  }
}

export async function githubGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new GitHubRequestError("GITHUB_NO_TOKEN", "GITHUB_TOKEN is required for GraphQL queries.");

  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "foundry-by-gitwork",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GitHubRequestError("GITHUB_GRAPHQL_FAILED", `GraphQL request failed: ${response.status}`);
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new GitHubRequestError("GITHUB_GRAPHQL_ERROR", json.errors[0].message);
  }
  return json.data as T;
}

/**
 * Fetch every file under `prefix/` in a (possibly private) repo, using one recursive Trees call +
 * per-blob fetches. Reuses `githubHeaders()` so `GITHUB_TOKEN` authorizes private-repo reads.
 * Returns `{ path, bytes }[]` with the full repo-relative path (prefix included). Best-effort: a
 * failed tree call returns `[]`; a failed individual blob is skipped. Bounded by `maxFiles`.
 */
export type RepoFile = { path: string; bytes: Uint8Array };

export async function fetchRepoSubtree(
  owner: string,
  repo: string,
  prefix: string,
  ref = "main",
  maxFiles = 400,
): Promise<RepoFile[]> {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  let tree: Array<{ path: string; type: string; sha: string }>;
  try {
    const data = await githubRequest<{
      tree: Array<{ path: string; type: string; sha: string }>;
    }>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    tree = data.tree ?? [];
  } catch {
    return [];
  }

  const blobs = tree
    .filter((e) => e.type === "blob" && e.path.startsWith(`${cleanPrefix}/`))
    .slice(0, maxFiles);

  const files = await Promise.all(
    blobs.map(async (entry): Promise<RepoFile | null> => {
      try {
        const blob = await githubRequest<{ content: string; encoding: string }>(
          `/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
        );
        const bytes: Uint8Array = new Uint8Array(
          Buffer.from(blob.content, blob.encoding === "base64" ? "base64" : "utf8"),
        );
        return { path: entry.path, bytes };
      } catch {
        return null;
      }
    }),
  );

  return files.filter((f): f is RepoFile => f !== null);
}

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "");

  // Handle "owner/repo" format
  const simpleMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2] };
  }

  // Handle full GitHub URL
  const urlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  return null;
}

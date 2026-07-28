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

/**
 * Parse any reasonable way someone might name a GitHub repo into `{owner, repo}`.
 *
 * People paste whatever the address bar or `git remote -v` gave them, so this accepts
 * all of it: `owner/repo`, a full https URL, a bare `github.com/...`, an SSH remote,
 * a deep link to a branch or file, a trailing `.git` or slash, and a stray `@`.
 *
 * It also tolerates a DOUBLED prefix (`github.com/https://github.com/owner/repo`),
 * which is what the Pulse scan header was producing: it stored the full URL and then
 * prefixed `github.com/` again when rendering. Always take the LAST `github.com/`
 * occurrence, so the innermost real path wins.
 */
export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^@/, "")
    // SSH remote → path form.
    .replace(/^git@github\.com:/i, "github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "github.com/")
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");

  // A URL-ish input: take the LAST github.com/ segment so a doubled prefix resolves.
  const lastHost = cleaned.toLowerCase().lastIndexOf("github.com/");
  const onGithub = lastHost !== -1;
  const path = onGithub ? cleaned.slice(lastHost + "github.com/".length) : cleaned;

  // First two path segments are owner and repo; anything after (tree/<branch>,
  // blob/<path>, pull/<n>) is a deep link and is discarded.
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  // Without a github.com host this must be the bare `owner/repo` form, and nothing
  // else: exactly two segments, and an owner that can't be a hostname. GitHub owners
  // are alphanumerics and hyphens only, so a dot means we were handed some other
  // host's path — `gitlab.com/group/project` must not parse as owner `gitlab.com`.
  if (!onGithub && (segments.length !== 2 || /\./.test(segments[0]))) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  const NAME = /^[A-Za-z0-9_.-]+$/;
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  // GitHub reserves these as site routes, never as owners.
  if (/^(orgs|settings|features|about|pricing|login|marketplace|topics|explore)$/i.test(owner)) return null;

  return { owner, repo };
}

/**
 * Canonical `owner/repo` for storage, or null if the input isn't a repo reference.
 * Storing the canonical form is what stops a full URL being rendered as
 * `github.com/https://github.com/owner/repo`.
 */
export function normalizeGithubRepo(input: string): string | null {
  const parsed = parseGithubRepo(input);
  return parsed ? `${parsed.owner}/${parsed.repo}` : null;
}

/**
 * Display label for a stored repo reference — always `github.com/owner/repo`.
 * Handles historical rows that stored a full URL, so old scans render correctly too.
 * Falls back to the raw value rather than hiding something we can't parse.
 */
export function githubRepoLabel(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const normalized = normalizeGithubRepo(stored);
  return normalized ? `github.com/${normalized}` : stored;
}

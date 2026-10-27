import { GithubConditionalCache, cacheKey, tokenIdentity, type GithubCacheStats } from "./github-cache";

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

/** True when a GitHub token is configured. Never returns the value itself. */
export function hasGithubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

// Warn once per process when GitHub is used with no token. Without this the failure
// is completely silent: unauthenticated REST 404s on every private repo and GraphQL
// refuses outright, so callers see "empty" rather than "unauthorised" and report the
// repo as containing nothing. That is exactly what happened in production for months.
let warnedNoToken = false;

export function githubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();

  if (!token && !warnedNoToken) {
    warnedNoToken = true;
    console.warn(
      "[github] GITHUB_TOKEN is not set. Private repositories will return 404 and GraphQL " +
        "queries will fail, so Pulse repo scans and CodeClear analysis cannot read source. " +
        "Set it in the VPS .env (or the FOUNDRY_GITHUB_TOKEN Actions secret) and restart.",
    );
  }

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "foundry-by-gitwork",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Rate-limit awareness ──────────────────────────────────────────────────────
// Every Pulse repo scan shares ONE token (5,000 REST calls an hour), and a single repo
// scan can spend a couple of hundred reading files. When it runs out, GitHub answers 403
// for everything — and `safeGithubRequest` swallows that, so a public repo used to be
// reported as "does not exist, or the token cannot see it". Record it here, centrally,
// so the scan can name the real cause and the time it clears.
let rateLimitedUntil: number | null = null;

/** When GitHub's REST limit for this server resets, if it is exhausted right now. */
export function githubRateLimitedUntil(now = Date.now()): Date | null {
  return rateLimitedUntil !== null && rateLimitedUntil > now ? new Date(rateLimitedUntil) : null;
}

/** Test seam. */
export function __resetGithubRateLimit(): void {
  rateLimitedUntil = null;
}

function noteRateLimit(response: Response, body: string): boolean {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limited = response.status === 429 || remaining === "0" || /rate limit/i.test(body);
  if (!limited) return false;
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  const retryAfter = Number(response.headers.get("retry-after"));
  rateLimitedUntil = Number.isFinite(reset) && reset > 0
    ? reset * 1000
    : Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000);
  return true;
}

// ── Conditional requests ──────────────────────────────────────────────────────
// A GET answered `304 Not Modified` does not count against GitHub's primary rate limit, so
// every GET remembers its ETag / Last-Modified and body (src/lib/github-cache.ts) and sends
// them back next time. On a 304 the stored body is returned exactly as a 200 would have been.
const conditionalCache = new GithubConditionalCache();
const CACHE_LOG_EVERY = 500;
let cacheLookupsSinceLog = 0;

/** Hits, 304s and misses for the conditional-request cache, for logging. */
export function githubCacheStats(): GithubCacheStats {
  return conditionalCache.stats();
}

/** Test seam. */
export function __resetGithubCache(): void {
  conditionalCache.clear();
  cacheLookupsSinceLog = 0;
}

function noteCacheLookup(): void {
  cacheLookupsSinceLog++;
  if (cacheLookupsSinceLog < CACHE_LOG_EVERY) return;
  cacheLookupsSinceLog = 0;
  const s = conditionalCache.stats();
  console.info(
    `[github] conditional cache: ${s.notModified} served by 304 (not counted against the rate limit), ` +
      `${s.misses} full reads, ${s.entries} entries, ${Math.round(s.bytes / 1024)} KB.`,
  );
}

export async function githubRequest<T>(path: string): Promise<T> {
  const url = `${GITHUB_API_BASE}${path}`;
  const baseHeaders: Record<string, string> = githubHeaders();
  const key = cacheKey(url, baseHeaders.Accept, tokenIdentity(process.env.GITHUB_TOKEN));
  const conditional = conditionalCache.conditionalHeaders(key);

  const response = await fetch(url, {
    headers: { ...baseHeaders, ...conditional },
    cache: "no-store",
  });

  noteCacheLookup();

  // 304: GitHub confirmed our stored body is current. Only reachable when we sent a
  // validator, so a stored entry exists; if it was evicted in the meantime, fall through
  // to the error path rather than inventing a body.
  if (response.status === 304) {
    const entry = conditionalCache.get(key);
    if (entry) {
      conditionalCache.recordNotModified();
      return JSON.parse(entry.body) as T;
    }
  } else {
    conditionalCache.recordMiss();
  }

  if (!response.ok) {
    // A failed read must never be answered from the cache later, and a stale entry must not
    // outlive a resource that is now gone or forbidden.
    conditionalCache.delete(key);
    const body = await response.text();
    const message = body || `GitHub request failed with status ${response.status}.`;

    if (response.status === 404) {
      throw new GitHubRequestError("GITHUB_NOT_FOUND", "GitHub resource not found.");
    }

    // A 403 is only a rate limit when GitHub says so. It used to be labelled one for EVERY
    // 403 — including a token that simply lacks access — which sent people the wrong fix.
    if (response.status === 403 || response.status === 429) {
      if (noteRateLimit(response, body)) {
        throw new GitHubRequestError(
          "GITHUB_RATE_LIMITED",
          "GitHub API is temporarily rate limited. Try again shortly or configure GITHUB_TOKEN.",
        );
      }
      throw new GitHubRequestError("GITHUB_FORBIDDEN", "GitHub refused access to this resource.");
    }

    throw new GitHubRequestError("GITHUB_REQUEST_FAILED", message);
  }

  const text = await response.text();
  const parsed = JSON.parse(text) as T;
  if (response.status === 200) {
    conditionalCache.set(key, text, response.headers.get("etag"), response.headers.get("last-modified"));
  }
  return parsed;
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

  const json = (await response.json()) as {
    data?: T | null;
    errors?: { message: string; type?: string; path?: (string | number)[] }[];
  };

  // GraphQL is PARTIAL-SUCCESS by design: a field the token cannot read comes back
  // `null` with an entry in `errors`, alongside perfectly good data for every other
  // field. Throwing on any error therefore discarded the whole response — and since
  // runCodeAgent catches that into `checks: []`, one unreadable auxiliary field
  // (vulnerabilityAlerts needs Dependabot-alerts:read, branchProtectionRules needs
  // admin) silently disabled EVERY check the code agent emits, including the whole
  // iOS and Flutter families. Only throw when there is nothing usable to return.
  if (json.errors?.length) {
    const usable =
      json.data != null &&
      typeof json.data === "object" &&
      Object.values(json.data as Record<string, unknown>).some((v) => v != null);

    if (!usable) {
      throw new GitHubRequestError("GITHUB_GRAPHQL_ERROR", json.errors[0].message);
    }

    const fields = json.errors
      .map((e) => e.path?.join(".") ?? e.type ?? "?")
      .filter((f, i, all) => all.indexOf(f) === i)
      .join(", ");
    console.warn(
      `[github] GraphQL returned partial data; unreadable field(s): ${fields}. ` +
        `First error: ${json.errors[0].message}. Continuing with the fields that did resolve.`,
    );
  }

  if (json.data == null) {
    throw new GitHubRequestError("GITHUB_GRAPHQL_ERROR", "GraphQL response contained no data.");
  }

  return json.data;
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

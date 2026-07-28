// ─────────────────────────────────────────────────────────────────────────────
// NATIVE MOBILE REPO READER — the only I/O in the native-mobile family.
//
// One recursive tree call, then a bounded set of content fetches:
//   • CONFIG files are always read (few, small, high signal): Info.plist,
//     entitlements, project.pbxproj, lockfiles.
//   • SWIFT sources are SAMPLED, relevance-ranked and capped. Sampling is why
//     ios-app.ts separates "presence" findings (sound on a sample) from "absence"
//     findings (marked LOW confidence, and so unscored, when coverage is thin).
//
// The snapshot is MEMOIZED per owner/repo for a short window, with in-flight
// promise dedup. That matters: runGithubChecks needs the detected platform to know
// which of its own generic checks to skip, and runCodeAgent needs the full
// snapshot for the iOS family — and the two run in PARALLEL. Without the memo they
// would each fetch the tree; with it there is exactly one fetch per scan.
// ─────────────────────────────────────────────────────────────────────────────

import { parseGithubRepo, safeGithubRequest } from "@/lib/github";
import type { PulseScanCheckInput } from "@/types/pulse";
import { detectNativePlatform, isVendoredPath, type NativePlatform, type RepoSnapshot } from "./native-mobile";
import { evaluateIosChecks } from "./ios-app";

/** Max Swift files whose contents we read. See ios-app.ts for how coverage is used. */
const SWIFT_SAMPLE_CAP = 150;
/** Concurrency for content fetches — bounded so a big repo can't stampede the API. */
const FETCH_CONCURRENCY = 15;
/** Skip blobs above this size (minified bundles, generated Lottie JSON, binaries). */
const MAX_BLOB_BYTES = 400_000;
/** Memo lifetime — long enough to span one scan's parallel waves, short enough to stay fresh. */
const MEMO_TTL_MS = 120_000;

interface GitTreeResponse {
  tree?: { path: string; type: string; size?: number }[];
  truncated?: boolean;
}

interface ContentsResponse {
  content?: string;
  encoding?: string;
}

/** Config files that are always worth reading in full. */
const CONFIG_PATTERNS: RegExp[] = [
  /(^|\/)Info\.plist$/i,
  /\.entitlements$/i,
  /project\.pbxproj$/i,
  /(^|\/)Podfile$/i,
  /(^|\/)Podfile\.lock$/i,
  /(^|\/)Package\.swift$/i,
  /Package\.resolved$/i,
  /(^|\/)\.swiftlint\.ya?ml$/i,
];

/**
 * Files that MUST be read whatever else is in the repo, matched on the BASENAME.
 *
 * Learned by validating against a real app: the critical credential-logging finding
 * lives in `Logger.swift`, which scored 900 below a hundred-odd `*Service.swift`
 * files at 1000 and was cut by the cap — so the scan reported the app as clean. And
 * `UserJourneyKeys.swift`, which holds the token keys, matched no pattern at all
 * because the token names are in its CONTENTS, not its path.
 *
 * A concern-based ranking cannot fix that on its own: these files are small, so size
 * never rescues them either. They get an unbeatable score instead.
 */
const MUST_READ_BASENAMES =
  /^(logger|logging|log|keychain\w*|\w*keychain|userdefaults|\w*storage|\w*store|\w*persist\w*|environment\w*|\w*environment|config\w*|constants|strings|settings|apiclient|api-client|networkmanager|reachability|appdelegate\w*|scenedelegate|app|session\w*|\w*session|auth\w*|\w*auth|token\w*|\w*token|\w*journey\w*|cache\w*|\w*cache\w*|\w*keys)\.swift$/i;

/**
 * Relevance for Swift sampling, in three tiers:
 *   1. MUST_READ basenames — the files that carry the FAIL-severity findings.
 *   2. Concern keywords in the path — networking, auth, logging, caching, media.
 *   3. Size, as the tiebreaker: a codebase-wide idiom (Dynamic Type, accessibility
 *      labels) shows up in the big view files if it is used at all, which is what
 *      makes a partial sample adequate evidence of an absence.
 */
export function swiftRelevance(path: string, size: number): number {
  const p = path.toLowerCase();
  const base = p.split("/").pop() ?? "";
  let score = 0;
  if (MUST_READ_BASENAMES.test(base)) score += 100_000;
  if (/(network|apiclient|api-client|service|request|session|http)/.test(p)) score += 1000;
  if (/(auth|login|signin|register|token|keychain|credential|secret)/.test(p)) score += 1000;
  if (/(logger|logging|analytics|telemetry)/.test(p)) score += 900;
  if (/(cache|caching|prefetch|download|offline)/.test(p)) score += 800;
  if (/(environment|config|constants|strings|settings|defaults|journey|state)/.test(p)) score += 700;
  if (/(player|video|stream|media)/.test(p)) score += 600;
  if (/(appdelegate|scenedelegate|\bapp\.swift)/.test(p)) score += 500;
  // Size as the tiebreaker — capped so one enormous file can't crowd out the rest.
  return score + Math.min(size, 60_000) / 1000;
}

/** Choose which paths to read, config first then a relevance-ranked Swift sample. */
export function selectFilesToRead(
  entries: { path: string; size: number }[],
): { config: string[]; swift: string[] } {
  const usable = entries.filter((e) => e.size <= MAX_BLOB_BYTES);
  const config = usable
    .filter((e) => CONFIG_PATTERNS.some((re) => re.test(e.path)) && !isVendoredPath(e.path))
    .map((e) => e.path);

  const swift = usable
    .filter((e) => /\.swift$/i.test(e.path) && !isVendoredPath(e.path))
    .map((e) => ({ path: e.path, score: swiftRelevance(e.path, e.size) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SWIFT_SAMPLE_CAP)
    .map((e) => e.path);

  return { config, swift };
}

async function fetchText(owner: string, repo: string, path: string): Promise<string | null> {
  const res = await safeGithubRequest<ContentsResponse>(
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    {},
  );
  if (!res.content || res.encoding !== "base64") return null;
  try {
    const text = Buffer.from(res.content.replace(/\n/g, ""), "base64").toString("utf-8");
    // Reject binaries — a NUL byte never appears in source or plist text.
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

/** Run an async mapper over items with bounded concurrency. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

async function buildSnapshot(owner: string, repo: string): Promise<RepoSnapshot> {
  const tree = await safeGithubRequest<GitTreeResponse>(
    `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {},
  );
  const blobs = (tree.tree ?? []).filter((e) => e.type === "blob");
  const paths = blobs.map((b) => b.path);

  if (paths.length === 0) {
    return { owner, repo, paths: [], files: new Map(), truncated: false, accessible: false };
  }

  // Only pay for content when this is actually a native mobile repo.
  const platform = detectNativePlatform(paths);
  if (platform !== "ios" && platform !== "android") {
    return { owner, repo, paths, files: new Map(), truncated: Boolean(tree.truncated), accessible: true };
  }

  const { config, swift } = selectFilesToRead(
    blobs.map((b) => ({ path: b.path, size: b.size ?? 0 })),
  );
  const files = new Map<string, string>();
  await mapLimit([...config, ...swift], FETCH_CONCURRENCY, async (path) => {
    const text = await fetchText(owner, repo, path);
    if (text !== null) files.set(path, text);
  });

  return { owner, repo, paths, files, truncated: Boolean(tree.truncated), accessible: true };
}

// ── Memo ─────────────────────────────────────────────────────────────────────

const memo = new Map<string, { at: number; promise: Promise<RepoSnapshot | null> }>();

/** Fetch (or reuse) the snapshot for a repo. Returns null when the input can't be parsed. */
export function getRepoSnapshot(repoInput: string): Promise<RepoSnapshot | null> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) return Promise.resolve(null);
  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();

  const cached = memo.get(key);
  if (cached && Date.now() - cached.at < MEMO_TTL_MS) return cached.promise;

  const promise = buildSnapshot(parsed.owner, parsed.repo).catch(() => null);
  memo.set(key, { at: Date.now(), promise });

  // Opportunistic eviction — keeps the map from growing across a long-lived process.
  for (const [k, v] of memo) {
    if (Date.now() - v.at > MEMO_TTL_MS) memo.delete(k);
  }
  return promise;
}

/** Test seam — drops the memo so unit tests never share state. */
export function __clearRepoSnapshotMemo(): void {
  memo.clear();
}

/**
 * The detected platform for a repo, using the shared snapshot. Safe to call from
 * anywhere in the scan; only the first caller pays for the network.
 */
export async function detectRepoPlatform(repoInput: string): Promise<NativePlatform | null> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return null;
  return detectNativePlatform(snapshot.paths);
}

/**
 * Run the native-mobile check family. Returns an empty list for anything that
 * isn't a native app (or that we couldn't read), so callers can always append.
 */
export async function runNativeMobileChecks(
  repoInput: string,
): Promise<{ platform: NativePlatform | null; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { platform: null, checks: [] };

  const platform = detectNativePlatform(snapshot.paths);
  if (platform === "ios") {
    return { platform, checks: evaluateIosChecks(snapshot) };
  }
  // Android lands here next — the reader, detection and applicability layers are
  // already platform-agnostic, so it is a checks module and a registry block.
  return { platform, checks: [] };
}

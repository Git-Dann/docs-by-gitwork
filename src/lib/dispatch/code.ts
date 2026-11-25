/**
 * Dispatch reading a client's code: which repositories it may open, which files it must never
 * read, and how a file is cut down to fit. Pure: no fetch, no DB.
 *
 * The only repositories are the ones on the pinned client's platforms (`ClientPlatform.repoUrl`).
 * A repository named in the question that isn't one of those is refused, whatever GitHub's token
 * could open.
 */

import { parseGithubRepo } from "@/lib/github";

export interface RepoChoice {
  /** The platform it belongs to ("iOS app"). */
  platform: string;
  owner: string;
  repo: string;
}

export function repoChoices(platforms: readonly { name: string; repoUrl: string | null }[]): RepoChoice[] {
  const seen = new Set<string>();
  const out: RepoChoice[] = [];
  for (const p of platforms) {
    const parsed = p.repoUrl ? parseGithubRepo(p.repoUrl) : null;
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: p.name, ...parsed });
  }
  return out;
}

export const repoLabel = (r: RepoChoice) => `${r.owner}/${r.repo}`;

/**
 * The repository a tool call means. With one repository it is that one; with several the model
 * must name one (by `owner/repo`, repo name or platform name). Returns the plain-English problem
 * otherwise, never a repository outside the list.
 */
export function pickRepo(choices: readonly RepoChoice[], wanted: string | undefined): RepoChoice | string {
  if (!choices.length) return "This client has no GitHub repository linked on its platforms.";
  const w = wanted?.trim().toLowerCase().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "");
  if (!w) {
    if (choices.length === 1) return choices[0];
    return `This client has ${choices.length} repositories. Say which: ${choices.map((c) => `${repoLabel(c)} (${c.platform})`).join(", ")}.`;
  }
  const hit = choices.find(
    (c) => repoLabel(c).toLowerCase() === w || c.repo.toLowerCase() === w || c.platform.toLowerCase() === w,
  );
  return hit ?? `That isn't one of this client's repositories. They are: ${choices.map(repoLabel).join(", ")}.`;
}

/**
 * Files that hold secrets rather than code. Never read, whatever is asked: redaction catches
 * known key formats, but a file like this is a secret in a shape nobody listed.
 */
const SENSITIVE = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|jks|keystore|mobileprovision|p8|cer|der|crt)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.pgpass$/i,
  /(^|\/)(secrets?|credentials?)(\.[a-z]+)?$/i,
  /(^|\/)service[-_]?account[^/]*\.json$/i,
  /(^|\/)google-services\.json$/i,
  /(^|\/)GoogleService-Info\.plist$/i,
  /(^|\/)\.aws\//i,
  /(^|\/)terraform\.tfstate/i,
];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE.some((re) => re.test(path));
}

/** A repository path the model gave, cleaned; null when it tries to climb out or is odd. */
export function cleanRepoPath(path: string | undefined): string | null {
  const p = (path ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (p.split("/").some((seg) => seg === ".." || seg === ".")) return null;
  if (!/^[\w@.+\-/ ()[\]]*$/.test(p)) return null;
  return p;
}

/** GitHub's contents API path, each segment encoded. */
export function contentsPath(r: RepoChoice, path: string): string {
  const enc = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
  return `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/contents${enc}`;
}

/**
 * Lines `from`..`to` (1-based, inclusive) with their numbers, so the model can cite them. Stops
 * before `cap` characters and says so, with the line to ask for next.
 */
export function numberedLines(text: string, from = 1, to?: number, cap = 7000): { text: string; more: number | null; total: number } {
  const lines = text.split("\n");
  const start = Math.max(1, Math.floor(from));
  const end = Math.min(lines.length, to ? Math.floor(to) : lines.length);
  const width = String(end).length;
  let out = "";
  for (let n = start; n <= end; n++) {
    const line = `${String(n).padStart(width, " ")}  ${lines[n - 1]}\n`;
    if (out.length + line.length > cap) return { text: out, more: n, total: lines.length };
    out += line;
  }
  return { text: out, more: null, total: lines.length };
}

/** A git ref the model passed (branch, tag, sha), or null if it isn't one. */
export function cleanRef(ref: string | undefined): string | null {
  const r = (ref ?? "").trim();
  if (!r || r.length > 120) return null;
  if (!/^[\w./-]+$/.test(r) || r.includes("..") || r.startsWith("/") || r.endsWith(".lock")) return null;
  return r;
}

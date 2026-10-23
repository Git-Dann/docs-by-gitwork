import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A shallow, read-only checkout of a GitHub repository, for the code-health measure.
 *
 * Why clone rather than read files through the API: a full measure needs every source
 * file, and the API costs one call per file against the single shared 5,000-an-hour token
 * (CLAUDE.md §62.7). A shallow clone is one request, does not count against that limit,
 * and gives the exact commit measured.
 *
 * The checkout is untrusted input, so:
 *  - github.com only, `owner/repo` validated, never a caller-supplied URL;
 *  - the token travels in an HTTP header, never in the URL, argv text or the logs;
 *  - hooks, symlinks, the file protocol, LFS smudging and prompts are all off;
 *  - nothing in the checkout is ever executed: it is read as text and parsed;
 *  - size, time and concurrency are capped, and the directory is always removed.
 */

/** Largest repository we will clone, by GitHub's reported size (KB, all history). */
export const MAX_REPO_KB = 500_000;
const CLONE_TIMEOUT_MS = 90_000;
/** Concurrent clones per server. A third scan waits rather than filling the disk. */
const MAX_CONCURRENT = 2;

const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export class CloneError extends Error {
  constructor(
    public readonly code: "invalid_repo" | "too_large" | "not_found" | "timeout" | "git_missing" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "CloneError";
  }
}

export function isCloneableRepo(slug: string): boolean {
  return REPO_RE.test(slug) && !slug.split("/")[1].startsWith(".") && !slug.endsWith(".git");
}

/** The git arguments for a hardened shallow clone. Exported so the flags are testable. */
export function cloneArgs(slug: string, dest: string, branch: string | null, token: string | null, historySince: string | null = null): string[] {
  const args = [
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.symlinks=false",
    "-c", "protocol.file.allow=never",
    "-c", "protocol.allow=never",
    "-c", "protocol.https.allow=always",
    "-c", "credential.helper=",
  ];
  if (token) {
    // Basic auth with the token as password, as GitHub documents for x-access-token.
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    args.push("-c", `http.https://github.com/.extraHeader=Authorization: Basic ${basic}`);
  }
  args.push("clone", "--single-branch", "--no-tags", "--quiet");
  // With history: every commit and tree since the date, but only the current file
  // contents (a blobless partial clone). Without: the latest commit only.
  if (historySince) args.push("--filter=blob:none", `--shallow-since=${historySince}`);
  else args.push("--depth", "1");
  if (branch) args.push("--branch", branch);
  args.push(`https://github.com/${slug}.git`, dest);
  return args;
}

function run(cmd: string, args: string[], opts: { cwd?: string; timeout: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout,
        maxBuffer: 64 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: tmpdir(),
          GIT_TERMINAL_PROMPT: "0",
          GIT_LFS_SKIP_SMUDGE: "1",
          GIT_CONFIG_NOSYSTEM: "1",
          // A clean environment on purpose: nothing from the app's own env (secrets
          // included) reaches git. ProcessEnv's type wants NODE_ENV, so it is passed through.
          NODE_ENV: process.env.NODE_ENV,
        },
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
          if (e.code === "ENOENT") return reject(new CloneError("git_missing", "git is not installed on this server."));
          if (e.killed || e.signal === "SIGTERM") return reject(new CloneError("timeout", "The repository took too long to download."));
          return reject(new CloneError(/not found|Repository not found|could not read Username/i.test(stderr) ? "not_found" : "failed", scrub(stderr)));
        }
        resolve(stdout);
      },
    );
  });
}

/** Never let an error message carry a credential. */
function scrub(s: string): string {
  return s.replace(/Basic [A-Za-z0-9+/=]+/g, "Basic ***").replace(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g, "***").trim().slice(0, 300);
}

let active = 0;
const waiting: Array<() => void> = [];
async function slot(): Promise<() => void> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  return () => {
    active--;
    waiting.shift()?.();
  };
}

export interface Checkout {
  dir: string;
  /** Read-only git command in the checkout, for the history pass. */
  git: (args: string[]) => Promise<string>;
  commit: string | null;
  /** Tracked file paths, relative to `dir`. */
  files: string[];
}

/**
 * Clone, hand the checkout to `work`, and always delete it afterwards. The caller never
 * holds a path that outlives the call.
 */
export async function withCheckout<T>(
  slug: string,
  opts: { branch?: string | null; sizeKb?: number | null; historySince?: string | null },
  work: (checkout: Checkout) => Promise<T>,
): Promise<T> {
  if (!isCloneableRepo(slug)) throw new CloneError("invalid_repo", `"${slug}" is not a GitHub owner/repo.`);
  if (opts.sizeKb && opts.sizeKb > MAX_REPO_KB) {
    throw new CloneError("too_large", `The repository is ${Math.round(opts.sizeKb / 1024)} MB, over the ${MAX_REPO_KB / 1000} MB limit for a full measure.`);
  }
  const release = await slot();
  const root = await mkdtemp(join(tmpdir(), "pulse-code-health-"));
  try {
    const dest = join(root, "repo");
    const token = process.env.GITHUB_TOKEN?.trim() || null;
    try {
      await run("git", cloneArgs(slug, dest, opts.branch ?? null, token, opts.historySince ?? null), { timeout: CLONE_TIMEOUT_MS });
    } catch (e) {
      // A history clone that fails for any reason other than "not there" falls back to
      // the latest commit only: the measure still runs, the history is reported missing.
      if (!opts.historySince || (e instanceof CloneError && (e.code === "not_found" || e.code === "git_missing"))) throw e;
      await rm(dest, { recursive: true, force: true }).catch(() => {});
      await run("git", cloneArgs(slug, dest, opts.branch ?? null, token, null), { timeout: CLONE_TIMEOUT_MS });
    }
    const commit = (await run("git", ["rev-parse", "HEAD"], { cwd: dest, timeout: 10_000 }).catch(() => "")).trim() || null;
    const listed = await run("git", ["ls-files", "-z"], { cwd: dest, timeout: 20_000 });
    const files = listed.split("\0").filter(Boolean);
    const git = (args: string[]) => run("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: dest, timeout: 30_000 });
    return await work({ dir: dest, commit, files, git });
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    release();
  }
}

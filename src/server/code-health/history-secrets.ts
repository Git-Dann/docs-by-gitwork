import { CATEGORIES } from "@/server/pulse-checks/categories";
import { findSecrets } from "@/server/pulse-checks/secret-formats";
import { envLineHoldsSecret, isEnvFile } from "@/server/pulse-agents/secret-scanner";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * Credentials that were deleted from the code but are still in its history.
 *
 * The commonest real leak in a repository is not a secret in today's files (the
 * secret-scan collector reads those) but a `.env` or key file that was committed,
 * noticed, and deleted. Deleting it removes it from the checkout, not from history:
 * anyone who can clone the repository can still read it with one command.
 *
 * Scope, stated in the check so a PASS is not over-read:
 *  - files DELETED in the history window (12 months, the code-health clone's depth);
 *  - only files whose name says they hold credentials (env files, private keys,
 *    service-account / credentials JSON, package-registry auth files);
 *  - the version just before deletion is read. A secret added and then edited out of a
 *    file that still exists is not looked for: that needs every old version of every
 *    file, which a blobless clone would download one blob at a time.
 *
 * The clone is blobless, so each read fetches exactly one old blob from GitHub on demand.
 * At most MAX_READS are read.
 */

export const MAX_READS = 15;
const MAX_BYTES = 200_000;

/** Tests, fixtures and examples hold fake credentials on purpose. */
const NOT_REAL = /(^|\/)(tests?|__tests__|spec|specs|fixtures?|__fixtures__|examples?|samples?|demo|mocks?|testdata|docs?)\//i;

/** File names that hold credentials when they hold anything. */
export function isSensitiveHistoryPath(path: string): boolean {
  if (NOT_REAL.test(path)) return false;
  const base = (path.split("/").pop() ?? "").toLowerCase();
  if (isEnvFile(path)) return true;
  if (/\.(pem|key)$/.test(base) && !/\.pub\.(pem|key)$/.test(base) && !/public/.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  if (/^(credentials|client_secrets?|service[-_]?account[\w-]*|gcp[-_]key[\w-]*|firebase[-_]adminsdk[\w-]*)\.json$/.test(base)) return true;
  if (/^\.(npmrc|pypirc|netrc|git-credentials)$/.test(base)) return true;
  return /^(secrets?|credentials)\.(ya?ml|json|toml)$/.test(base);
}

export interface DeletedFile {
  sha: string;
  /** Unix seconds of the deleting commit. */
  time: number;
  path: string;
}

/** `git log` listing only deleted files, newest first. Read by `parseDeleted`. */
export function deletedFilesArgs(sinceIso: string): string[] {
  return ["log", `--since=${sinceIso}`, "--no-renames", "--diff-filter=D", "--name-only", "--format=%x1e%H%x1f%at"];
}

export function parseDeleted(out: string): DeletedFile[] {
  const seen = new Set<string>();
  const files: DeletedFile[] = [];
  for (const block of out.split("\x1e")) {
    const lines = block.split("\n");
    const [sha, time] = (lines.shift() ?? "").split("\x1f");
    if (!sha) continue;
    for (const raw of lines) {
      const path = raw.trim();
      // A path deleted, re-added and deleted again: the newest deletion holds the latest version.
      if (!path || seen.has(path)) continue;
      seen.add(path);
      files.push({ sha, time: Number(time) || 0, path });
    }
  }
  return files;
}

/** The kinds of credential in an old file's text. Placeholders and public-by-design keys are not. */
export function credentialsIn(path: string, text: string): string[] {
  const kinds = new Set<string>();
  for (const m of findSecrets(text)) if (!m.publicByDesign) kinds.add(m.kind);
  if (isEnvFile(path) && text.split(/\r?\n/).some(envLineHoldsSecret)) kinds.add("Secret in an environment file");
  // Package-registry and login files: a token or password that is not a ${VAR} reference
  // or a placeholder.
  if (/(^|\/)\.(npmrc|pypirc|netrc)$/i.test(path)) {
    const line = text.split(/\r?\n/).find((l) => /_authToken\s*=|^\s*password\s*[:=]|\bpassword\s+\S/i.test(l) && !/\$\{|changeme|example|your_|xxxx|placeholder/i.test(l));
    if (line && /(_authToken\s*=\s*|password\s*[:=]?\s*)\S{8,}/i.test(line)) kinds.add("Registry or login credential");
  }
  if (/"private_key"\s*:\s*"-----BEGIN/.test(text)) kinds.add("Service account private key");
  return [...kinds];
}

export interface HistorySecretFinding {
  path: string;
  sha: string;
  time: number;
  kinds: string[];
}

export interface HistorySecretsResult {
  /** Sensitive-looking files deleted in the window. */
  candidates: number;
  /** How many of them were actually read. */
  read: number;
  findings: HistorySecretFinding[];
}

/** Find deleted credential files in history and read the version before each deletion. */
export async function scanDeletedSecrets(git: (args: string[]) => Promise<string>, sinceIso: string): Promise<HistorySecretsResult> {
  const deleted = parseDeleted(await git(deletedFilesArgs(sinceIso))).filter((f) => isSensitiveHistoryPath(f.path));
  const findings: HistorySecretFinding[] = [];
  let read = 0;
  for (const f of deleted.slice(0, MAX_READS)) {
    let text: string;
    try {
      // The deleting commit's parent still has the file. Outside the shallow boundary this
      // fails, and the file counts as not read rather than as clean.
      text = await git(["cat-file", "-p", `${f.sha}^:${f.path}`]);
    } catch {
      continue;
    }
    read++;
    if (text.length > MAX_BYTES || text.includes("\0")) continue;
    const kinds = credentialsIn(f.path, text);
    if (kinds.length > 0) findings.push({ ...f, kinds });
  }
  return { candidates: deleted.length, read, findings };
}

const KEY = "secrets_in_git_history";
const LABEL = "No credentials left in deleted files in git history";

/** The check. `null` result = the history could not be read. Pure. */
export function historySecretsCheck(result: HistorySecretsResult | null, why?: string): PulseScanCheckInput {
  const base = { category: CATEGORIES.SECRETS_KEYS, checkKey: KEY, label: LABEL } as const;
  if (!result) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: `Not checked: ${why ?? "the repository's history could not be read."} This is a gap in the scan, not a finding about the code.`,
    };
  }
  if (result.findings.length > 0) {
    const list = result.findings.slice(0, 5).map((f) =>
      `${f.path} (deleted ${new Date(f.time * 1000).toISOString().slice(0, 10)} in ${f.sha.slice(0, 7)}: ${f.kinds.join(", ")})`,
    );
    return {
      ...base,
      status: "FAIL",
      confidence: "HIGH",
      severity: "CRITICAL",
      evidenceStrength: "VERIFIED",
      detail:
        `${result.findings.length === 1 ? "A file" : `${result.findings.length} files`} holding credentials ` +
        `${result.findings.length === 1 ? "was" : "were"} deleted from the code but ${result.findings.length === 1 ? "is" : "are"} still in its git history, ` +
        `readable by anyone who can clone the repository: ${list.join("; ")}. Rotate these credentials now. ` +
        "Rewriting history afterwards (git filter-repo) is tidying; rotating is the fix, because existing clones and forks keep the old copy.",
      evidence: JSON.stringify(result.findings.slice(0, 5).map((f) => ({ path: f.path, commit: f.sha, kinds: f.kinds }))),
    };
  }
  if (result.candidates > result.read) {
    // Any file we could not read leaves the question open: a clean read of the others
    // does not make the rest clean.
    const unread = result.candidates - result.read;
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail:
        `${result.candidates} credential-like file${result.candidates === 1 ? " was" : "s were"} deleted in the last 12 months. ` +
        `${result.read > 0 ? `${result.read} were read from history and held no live credentials; ` : ""}` +
        `${unread} could not be read (older than the history Pulse downloads, or over the ${MAX_READS}-file limit), so whether ${unread === 1 ? "it holds" : "they hold"} secrets is not known.`,
    };
  }
  return {
    ...base,
    status: "PASS",
    confidence: "MEDIUM",
    confidenceReason: "Only files deleted in the last 12 months, with credential-like names, are read.",
    detail:
      result.candidates === 0
        ? "No credential files (env files, private keys, service-account JSON) were deleted in the last 12 months, so none are lingering in recent history."
        : `${result.read} credential-like file${result.read === 1 ? "" : "s"} deleted in the last 12 months ${result.read === 1 ? "was" : "were"} read from history and held no live credentials.`,
  };
}

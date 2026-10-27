import { CATEGORIES } from "../pulse-checks/categories";
// Wave B — repo secret scanning + prompt-injection heuristics.
//
// Walks the GitHub git tree (one REST call), flags committed env files by path,
// then fetches a small, capped set of high-risk candidate files and regex-scans
// their contents for live credential patterns. Designed to stay well inside the
// REST rate budget: one tree call + at most CANDIDATE_CAP content fetches.
//
// All findings are best-effort and conservative — placeholder/example values are
// filtered out to avoid crying wolf on .env.example scaffolds.

import { safeGithubRequest } from "@/lib/github";
import type { PulseScanCheckInput } from "@/types/pulse";
import { findSecrets } from "../pulse-checks/secret-formats";

export interface SecretFinding {
  file: string;
  type: string;
}

/** A key that is meant to ship in client code (noted, never a finding). */
export interface PublicKeyNote {
  file: string;
  type: string;
}

const CATEGORY = CATEGORIES.SECRETS_KEYS;
const CANDIDATE_CAP = 18; // max files we fetch content for
const MAX_BLOB_BYTES = 200_000; // skip large/binary blobs

interface GitTreeResponse {
  tree?: { path: string; type: string; size?: number }[];
  truncated?: boolean;
}

interface ContentsResponse {
  content?: string;
  encoding?: string;
}

// Credential formats live in pulse-checks/secret-formats.ts, which separates real
// secrets from keys that are public by design (Google AIza… browser/Firebase keys,
// Stripe pk_live_) and from placeholders. A Firebase web config committed in
// firebase_options.dart / firebase.ts is NOT a leak, and used to be a CRITICAL FAIL.

// Direct user-input → prompt interpolation (prompt injection risk). Only asked of a
// file that actually calls a model (AI_CALL): `Error: ${message}` in an ordinary file
// is not a prompt. Template literals (bounded, so one cannot run across a file) and
// Python f-strings both count.
const PROMPT_INJECTION_RE =
  /`[^`]{0,2000}?\$\{\s*(?:req\.(?:body|query|params)|request\.(?:body|json|form|args|query)|userInput|user_input|userMessage|input|prompt)\b[^`]{0,2000}?`|\bf(?:"{3}|'{3}|"|')[^\n]{0,400}?\{\s*(?:request\.(?:json|form|args|data|get_json)|user_input|user_message|prompt|query)\b/;
/** A file that calls an LLM: an SDK import or a completion call. */
const AI_CALL =
  /from\s+["'](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|ai|@ai-sdk\/[\w-]+|langchain|@langchain\/[\w-]+|groq-sdk|@mistralai\/[\w-]+|ollama)["']|require\(\s*["'](?:openai|@anthropic-ai\/sdk)["']\s*\)|^\s*(?:import|from)\s+(?:openai|anthropic|langchain\w*|google\.generativeai|litellm)\b|\b(?:chat\.completions\.create|messages\.create|generateText|streamText|generateContent)\s*\(/m;
/** Paths likely to build prompts, given a few of the content-read slots. */
const AI_PATH = /(^|\/)(?:prompts?|llm|ai|agents?|openai|anthropic|gemini|chat|completions?)(?:\/|[._-][^/]*\.(?:t|j)sx?$|\.(?:t|j)sx?$|\.py$)/i;
const AI_SLOTS = 4;
/** An AI SDK in a package manifest. */
const AI_DEPENDENCY = /"(?:openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|ai|@ai-sdk\/[\w-]+|langchain|@langchain\/[\w-]+|groq-sdk|@mistralai\/[\w-]+|ollama)"\s*:/;

// Strings that mean "this is a placeholder, not a real secret".
const PLACEHOLDER_HINTS = [
  "example", "your_", "your-", "xxxx", "placeholder", "dummy", "redacted",
  "<", "changeme", "change_me", "todo", "sample", "test_key", "fake",
];

export function isEnvFile(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  if (/^\.env(\.[\w-]+)?$/.test(base)) {
    return !/\.(example|sample|template|dist)$/.test(base) && base !== ".env.example";
  }
  return false;
}

function looksPlaceholder(line: string): boolean {
  const l = line.toLowerCase();
  return PLACEHOLDER_HINTS.some((h) => l.includes(h));
}

// A committed env file only proves a leak when it actually holds a secret: a
// secret-named variable with a literal value, or a URL with an inline password.
// Secret-manager references (op://, vault:, ${VAR}), placeholders, and plain
// numbers/booleans are not secrets. The name match is deliberately broad (any
// *KEY*/*PASS*/*PWD* name) so APP_KEY, SERVICE_ROLE_KEY, MASTER_KEY, DB_PASS etc.
// still count.
const SECRET_NAME_ASSIGN_RE =
  /^\s*(?:export\s+)?[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PASS|PWD|KEY|CREDENTIAL|SALT|DSN)[A-Za-z0-9_]*\s*=\s*["']?([^"'\s#]+)/i;
const URL_WITH_PASSWORD_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s:@\/"']*:([^\s@\/"']+)@/i;

// A URL that IS the credential, whatever its variable is called: an incoming-webhook
// URL (the path segment is the secret) or a query-string token/key/signature.
const URL_EMBEDDED_SECRET_RE =
  /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}|discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}|[?&](?:access_token|token|api_?key|key|secret|sig|signature|password|code)=[^&\s"'#]{12,}/i;

// A filesystem path names where a secret lives. A random base64 secret can also
// start with "/", so a path must look like one: no base64 padding/plus, and either a
// file extension on the last segment or all-lowercase segments (/run/secrets/db).
function looksLikePath(value: string): boolean {
  if (!/^(?:\.{1,2}\/|~\/|\/)/.test(value) || /[+=]/.test(value)) return false;
  const segs = value.split("/").filter((s) => s && s !== "." && s !== ".." && s !== "~");
  if (segs.length === 0) return true;
  if (/\.[A-Za-z0-9]{1,6}$/.test(segs[segs.length - 1])) return true;
  return segs.every((s) => /^[a-z0-9_.-]+$/.test(s));
}

export function envLineHoldsSecret(line: string): boolean {
  if (looksPlaceholder(line)) return false;
  if (URL_EMBEDDED_SECRET_RE.test(line)) return true;
  const value = SECRET_NAME_ASSIGN_RE.exec(line)?.[1] ?? URL_WITH_PASSWORD_RE.exec(line)?.[1];
  if (!value) return false;
  if (/^(?:op:\/\/|vault:|\$\{|\$[A-Za-z_][A-Za-z0-9_]*$)/i.test(value)) return false;
  // A file path (GOOGLE_APPLICATION_CREDENTIALS=./sa.json) or a URL with no inline
  // password (JWKS_KEY_URL=https://...) names where a secret lives; it is not one.
  if (looksLikePath(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !URL_WITH_PASSWORD_RE.test(value)) return false;
  return !/^(?:\d+|true|false)$/i.test(value);
}

/** Rank a path by how likely it is to hold a secret (higher = scan first). */
function candidateScore(path: string): number {
  const base = (path.split("/").pop() ?? "").toLowerCase();
  if (isEnvFile(path)) return 100;
  if (/\.(pem|key|pfx|p12)$/.test(base)) return 90;
  if (/(secret|credential|config|settings|constants|firebase)/.test(base)) return 70;
  if (/^(index|app|server|main|client)\.(t|j)sx?$/.test(base)) return 40;
  if (/\.(env|ini|cfg|conf|yml|yaml|json|toml)$/.test(base) && path.split("/").length <= 2) return 30;
  return 0;
}

export async function scanRepoSecrets(
  owner: string,
  repo: string,
): Promise<{ checks: PulseScanCheckInput[]; secrets: SecretFinding[] }> {
  const tree = await safeGithubRequest<GitTreeResponse>(
    `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {},
  );
  const entries = tree.tree ?? [];

  if (entries.length === 0) {
    // Couldn't read the tree (private/no token/empty) — skip rather than mislead.
    return {
      checks: [
        skipCheck("repo_secret_keys", "No exposed credentials in committed source"),
        skipCheck("repo_env_committed", "Environment files not committed"),
      ],
      secrets: [],
    };
  }

  const blobs = entries.filter((e) => e.type === "blob");

  // 1. Committed env files (path-only signal, no fetch needed).
  const committedEnvFiles = blobs.map((b) => b.path).filter(isEnvFile);

  // 2. Pick candidate files to content-scan, by risk score, capped. A few of the slots
  // go to files named like prompt-building code, which would otherwise score 0 and
  // never be read, so the prompt check would pass on "not looked at".
  const sized = blobs.filter((b) => (b.size ?? 0) <= MAX_BLOB_BYTES && !/(^|\/)(node_modules|vendor|dist|build)\//.test(b.path));
  const aiCandidates = sized
    .filter((b) => AI_PATH.test(b.path) && /\.(?:[cm]?[jt]sx?|py)$/i.test(b.path) && !/\.(?:test|spec)\.|(^|\/)(?:tests?|__tests__)\//i.test(b.path))
    .slice(0, AI_SLOTS)
    .map((b) => ({ path: b.path, score: 1 }));
  const candidates = sized
    .map((b) => ({ path: b.path, score: candidateScore(b.path) }))
    .filter((c) => c.score > 0 && !aiCandidates.some((a) => a.path === c.path))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_CAP - aiCandidates.length)
    .concat(aiCandidates);
  const aiPathsInTree = sized.filter((b) => AI_PATH.test(b.path)).length;

  const secrets: SecretFinding[] = [];
  const publicKeys: PublicKeyNote[] = [];
  let filesRead = 0;
  let promptInjectionFile: string | null = null;
  const aiFilesRead: string[] = [];
  let manifestHasAi: boolean | null = null;
  const envFilesRead = new Set<string>();
  const envFilesWithSecrets = new Set<string>();

  await Promise.all(
    candidates.map(async (c) => {
      const res = await safeGithubRequest<ContentsResponse>(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(c.path).replace(/%2F/g, "/")}`,
        {},
      );
      // An empty file comes back as content "" -- it was read, and holds nothing.
      if (typeof res.content !== "string" || res.encoding !== "base64") return;
      let text: string;
      try {
        text = Buffer.from(res.content.replace(/\n/g, ""), "base64").toString("utf-8");
      } catch {
        return;
      }
      if (text.includes("\u0000")) return; // binary
      filesRead++;

      if (isEnvFile(c.path)) {
        envFilesRead.add(c.path);
        if (text.split("\n").some(envLineHoldsSecret)) envFilesWithSecrets.add(c.path);
      }
      for (const match of findSecrets(text)) {
        const list = match.publicByDesign ? publicKeys : secrets;
        if (!list.some((s) => s.file === c.path && s.type === match.kind)) list.push({ file: c.path, type: match.kind });
      }
      if (/(^|\/)package\.json$/.test(c.path) && !c.path.includes("/")) manifestHasAi = AI_DEPENDENCY.test(text);
      if (AI_CALL.test(text)) {
        aiFilesRead.push(c.path);
        if (!promptInjectionFile && PROMPT_INJECTION_RE.test(text)) promptInjectionFile = c.path;
      }
    }),
  );

  const checks: PulseScanCheckInput[] = [];

  const publicNote = publicKeys.length > 0
    ? ` Also found ${publicKeys.length} key${publicKeys.length !== 1 ? "s" : ""} that ${publicKeys.length !== 1 ? "are" : "is"} public by design (${[...new Set(publicKeys.map((k) => k.type))].join(", ")} in ${[...new Set(publicKeys.map((k) => k.file))].slice(0, 3).join(", ")}) — these ship in client code and are secured by restrictions, not secrecy. Not a finding; confirm the Google key is restricted to your app/referrers in the Cloud console.`
    : "";
  const unread = candidates.length - filesRead;
  checks.push(
    secrets.length > 0
      ? {
          category: CATEGORY,
          checkKey: "repo_secret_keys",
          label: "No exposed credentials in committed source",
          status: "FAIL",
          detail: `CRITICAL: ${secrets.length} live credential${secrets.length !== 1 ? "s" : ""} found in committed files. Rotate immediately and move to environment variables / a secrets manager.${publicNote}`,
          evidence: secrets.slice(0, 5).map((s) => `${s.type} in ${s.file}`).join("; "),
        }
      : candidates.length > 0 && filesRead === 0
        ? {
            category: CATEGORY,
            checkKey: "repo_secret_keys",
            label: "No exposed credentials in committed source",
            status: "INCONCLUSIVE",
            detail: `None of the ${candidates.length} files most likely to hold a credential could be read, so whether any are committed could not be established.`,
          }
        : {
            category: CATEGORY,
            checkKey: "repo_secret_keys",
            label: "No exposed credentials in committed source",
            status: "PASS",
            detail: `No live API keys, tokens, or private keys found in the ${filesRead} highest-risk file${filesRead !== 1 ? "s" : ""} Pulse read${unread > 0 ? ` (${unread} could not be read)` : ""}.${publicNote}`,
            evidence: publicKeys.length > 0 ? publicKeys.slice(0, 5).map((k) => `${k.type} in ${k.file}`).join("; ") : undefined,
          },
  );

  const envFilesHoldingSecrets = committedEnvFiles.filter(
    (p) => envFilesWithSecrets.has(p) || secrets.some((s) => s.file === p),
  );
  const envFilesUnread = committedEnvFiles.filter((p) => !envFilesRead.has(p));
  checks.push({
    category: CATEGORY,
    checkKey: "repo_env_committed",
    label: "Environment files not committed",
    status: envFilesHoldingSecrets.length > 0 ? "FAIL" : committedEnvFiles.length > 0 ? "WARN" : "PASS",
    detail:
      envFilesHoldingSecrets.length > 0
        ? `${envFilesHoldingSecrets.length} committed environment file${envFilesHoldingSecrets.length !== 1 ? "s" : ""} contain${envFilesHoldingSecrets.length === 1 ? "s" : ""} what looks like a credential (a literal value for a secret-named variable, a password in a URL, or a known key format). Rotate it and git-ignore the file.`
        : committedEnvFiles.length > 0
          ? `${committedEnvFiles.length} environment file${committedEnvFiles.length !== 1 ? "s are" : " is"} committed. Pulse recognised no credential values in the ones it read${envFilesUnread.length > 0 ? ` (${envFilesUnread.length} could not be read)` : ""}. Confirm they hold only non-secret defaults, or git-ignore them.`
          : "No .env files committed to the repository.",
    evidence:
      committedEnvFiles.length > 0
        ? (envFilesHoldingSecrets.length > 0 ? envFilesHoldingSecrets : committedEnvFiles).slice(0, 5).join(", ")
        : undefined,
  });

  const promptBase = { category: CATEGORY, checkKey: "repo_prompt_injection_risk", label: "No raw user input interpolated into AI prompts" } as const;
  checks.push(
    promptInjectionFile
      ? {
          ...promptBase,
          status: "WARN",
          detail: `Possible prompt-injection vector: user-controlled input appears interpolated directly into a prompt string in a file that calls a model (${promptInjectionFile}). Delimit user content clearly, keep it out of the system instructions, and treat the model's output as untrusted.`,
          evidence: promptInjectionFile,
        }
      : aiFilesRead.length > 0
        ? {
            ...promptBase,
            status: "PASS",
            detail: `No raw request or user-input value is interpolated into a prompt in the ${aiFilesRead.length} model-calling file${aiFilesRead.length === 1 ? "" : "s"} Pulse read. Other prompt-building code in the repository was not read.`,
            evidence: aiFilesRead.slice(0, 3).join(", "),
          }
        : manifestHasAi === false && aiPathsInTree === 0
          ? {
              ...promptBase,
              status: "NOT_APPLICABLE",
              detail: "No AI SDK in package.json and no prompt-building files in the repository, so there are no prompts to check.",
            }
          : {
              ...promptBase,
              status: "INCONCLUSIVE",
              detail: "None of the files Pulse read calls a model, so whether user input reaches a prompt unescaped was not checked.",
            },
  );

  return { checks, secrets };
}

function skipCheck(checkKey: string, label: string): PulseScanCheckInput {
  return {
    category: CATEGORY,
    checkKey,
    label,
    status: "SKIPPED",
    detail: "Repository tree not accessible (private repo or no GitHub token).",
  };
}

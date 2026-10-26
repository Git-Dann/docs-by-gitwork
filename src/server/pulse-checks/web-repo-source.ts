// ─────────────────────────────────────────────────────────────────────────────
// WEB / SERVICE REPO SOURCE CHECKS — the blind spot at the centre of Pulse.
//
// WHY THIS EXISTS. Pulse reads SOURCE for seven repo shapes — iOS, Android,
// Flutter, React Native, Electron/Tauri, CLI and browser extension. For the
// eighth, and by far the most common one, it read none at all: a plain web or
// service repo resolved to shape "none" and the snapshot builder returned after
// the round-0 manifest probes. So a Next.js app, an Express API or a Django
// service was graded on its HTTP responses, its GitHub metadata, and a filename
// listing — and nothing whatsoever about the code inside it.
//
// That is precisely the population where AI-assisted development concentrates.
// A 549-repo study of self-identified AI/vibe-coded projects (ogbuilds.ai, July
// 2026) found `dangerouslySetInnerHTML` in 42.6%, injection-category findings in
// 47.5%, and a .gitignore that exists but does not cover .env in 35.7%. Pulse
// could see the third of those only as "a .gitignore file is present", and the
// other two not at all.
//
// WHAT THIS IS NOT. It is not a SAST engine, and it must not pretend to be. Every
// check here is a high-signal PATTERN with a documented reason to be wrong, in a
// codebase we are sampling rather than parsing. So:
//
//   • PRESENCE findings ("we found `eval(`") are sound on a sample — we saw it.
//   • ABSENCE findings self-downgrade to LOW confidence below the coverage
//     threshold, exactly as in every other family.
//   • Anything that needs dataflow to judge (is this innerHTML fed by user input?)
//     is reported as "here is the site, confirm the input is trusted", never as a
//     confirmed vulnerability. A scanner that cries wolf on template code is worse
//     than one that stays quiet.
//
// Comments are stripped before matching. A commented-out `eval()` is not live
// code, and that bug has now shipped three times in this codebase (§34.3, §34.6).
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, stripCStyleComments, sampleCoverage } from "./native-mobile";
import { anyDependency, parsePackageManifest, type PackageManifest } from "./project-shape";

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/**
 * Per-rule finding cap.
 *
 * A single noisy rule must not dominate the report — one file with forty
 * `innerHTML` assignments is ONE finding about that file, not forty findings about
 * the repo. Pulse's own §34.5 lesson (a raw count grows with any codebase and
 * fires on every large repo forever) is the same principle from the other end.
 */
const MAX_SITES_QUOTED = 5;

interface WebContext {
  /** Sampled source with comments stripped — for "is this live code?". */
  source: string;
  /** Same source, comments intact — for signals that live in comments. */
  sourceRaw: string;
  /** Per-file map of the sampled source, so findings can name a file. */
  files: Map<string, string>;
  /** .gitignore contents, if committed. */
  gitignore: string;
  /** README + shell scripts, where install instructions live. */
  docsAndScripts: string;
  /** CI workflows and audit-tool config, which are source evidence of a real gate. */
  automation: string;
  /** SQL / migration files, for the RLS check. */
  sql: string;
  pkg: PackageManifest | null;
  /** Sampled fraction of the repo's source files (0–1). */
  coverage: number;
  paths: string[];
}

const SOURCE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|go|java|cs)$/i;

/**
 * Third-party libraries copied into a served static tree (e.g. djangoproject's
 * `static/js/lib/require.js`) or shipped minified. They are not the project's own
 * code, so a finding there must not be attributed to it. Deliberately anchored to
 * the lib dir sitting directly in the static root (optionally under js/): Rails and
 * Ember keep FIRST-PARTY code at `app/assets/javascripts/<app>/app/lib/`, which a
 * looser `assets/.../lib/` match would silently drop.
 */
function isBundledStaticLibrary(path: string): boolean {
  return (
    // JS only: a `public/lib/db.php` under a PHP webroot is first-party server code.
    (/\.(?:js|mjs|cjs)$/i.test(path) &&
      /(^|\/)(?:static|public|wwwroot)\/(?:(?:js|javascripts?|scripts)\/)?(?:lib|libs|vendor|vendors|third[-_]?party)\//i.test(path)) ||
    /\.min\.js$/i.test(path)
  );
}

function buildContext(snapshot: RepoSnapshot): WebContext {
  const sourcePaths = snapshot.paths.filter(
    (p) => SOURCE_RE.test(p) && !isVendoredPath(p) && !isBundledStaticLibrary(p),
  );
  const files = new Map<string, string>();
  let gitignore = "";
  let docsAndScripts = "";
  let automation = "";
  let sql = "";
  let pkgText: string | null = null;

  for (const [path, text] of snapshot.files) {
    if (/(^|\/)\.gitignore$/i.test(path)) gitignore += "\n" + text;
    else if (/^README(\.md|\.markdown|\.rst|\.txt)?$/i.test(path) || /\.(sh|bash)$/i.test(path)) {
      docsAndScripts += "\n" + text;
    } else if (
      /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) ||
      /(^|\/)(Dockerfile|docker-compose[^/]*\.ya?ml)$/i.test(path) ||
      /(^|\/)(?:\.?security|\.?quality|\.?audit|\.?static[-_ ]analysis|\.?secret[-_ ]scan|\.?supply[-_ ]chain|\.?accessibility|\.?browser[-_ ]tests?|\.?dynamic[-_ ]security)\.(ya?ml|json|toml)$/i.test(path)
    ) {
      automation += "\n" + text;
    } else if (/\.sql$/i.test(path) && !isVendoredPath(path)) sql += "\n" + text;
    else if (/(^|\/)package\.json$/i.test(path) && !path.includes("/")) pkgText = text;
    else if (SOURCE_RE.test(path) && !isVendoredPath(path) && !isBundledStaticLibrary(path)) files.set(path, text);
  }

  const sourceRaw = [...files.values()].join("\n");
  return {
    source: stripCStyleComments(sourceRaw),
    sourceRaw,
    files,
    gitignore,
    docsAndScripts,
    automation,
    sql,
    pkg: parsePackageManifest(pkgText),
    coverage: sampleCoverage(files.size, sourcePaths.length, snapshot.truncated),
    paths: snapshot.paths,
  };
}

function absence(ctx: WebContext, check: Omit<PulseScanCheckInput, "confidence">): PulseScanCheckInput {
  const sound = ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this project's source files — below the ` +
        `threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

/**
 * Files whose comment-stripped contents match a pattern, capped and named.
 *
 * Naming the file is what turns "your app has an injection risk" into something a
 * developer can act on in the next thirty seconds — and it is what stops the
 * finding being argued with, because it can be checked.
 */
export function sitesMatching(ctx: WebContext, re: RegExp): { count: number; where: string } {
  const hits: string[] = [];
  for (const [path, text] of ctx.files) {
    if (re.test(stripCStyleComments(text))) hits.push(path);
  }
  const shown = hits.slice(0, MAX_SITES_QUOTED);
  const more = hits.length - shown.length;
  return {
    count: hits.length,
    where: shown.join(", ") + (more > 0 ? ` (+${more} more)` : ""),
  };
}

export function evaluateWebSourceChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot);
  // No source was read — say nothing rather than emitting a wall of passes we
  // cannot support. This is the §35 rule in its most literal form.
  if (ctx.files.size === 0 && ctx.gitignore === "" && ctx.docsAndScripts === "" && ctx.automation === "") return [];

  return [
    ...injectionChecks(ctx),
    ...credentialChecks(ctx),
    ...frameworkDefaultChecks(ctx),
    ...transportChecks(ctx),
    ...supplyChainChecks(ctx),
    ...automationChecks(ctx),
    ...deliverySafetyChecks(ctx),
    ...aiRepositorySafetyChecks(ctx),
    ...aiRepositoryReadinessChecks(ctx),
  ];
}

// ── AI repository checks ───────────────────────────────────────────────────
// Audit, Oct 2026: every rule here used to be one keyword regex over the whole
// concatenated repo, and four of them FAILed at HIGH from it. Three were simply
// wrong — a negative lookahead after `[\s\S]{0,180}` that always succeeds, a
// "client-readable" claim made about server route handlers, and any `fetch(`
// within 160 characters of `toolCall` read as an unsafe tool. The rules below say
// what they actually observed and no more: a concrete unsafe construct is named
// per file; anything that needs dataflow is a MEDIUM-confidence WARN that asks a
// person to confirm.

/** What a repo must DO to count as using an LLM — an SDK import or an API call, never a word. */
const AI_USAGE =
  /\bfrom\s+["'`](?:openai|@anthropic-ai\/sdk|ai|@ai-sdk\/[\w-]+|@google\/(?:generative-ai|genai)|@mistralai\/mistralai|cohere-ai|langchain|@langchain\/[\w-]+|llamaindex)["'`]|\brequire\(\s*["'`](?:openai|@anthropic-ai\/sdk|ai|@ai-sdk\/[\w-]+|@google\/(?:generative-ai|genai)|langchain|@langchain\/[\w-]+)["'`]\s*\)|^\s*(?:from\s+(?:openai|anthropic|langchain[\w.]*|llama_index[\w.]*|google\.generativeai|google\.genai)\s+import|import\s+(?:openai|anthropic))\b|\bchat\.completions\.create\s*\(|\bmessages\.create\s*\(|\bresponses\.create\s*\(|\bgenerateContent\s*\(|\b(?:generateText|streamText|generateObject|streamObject)\s*\(|\buseChat\s*\(|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/im;

/** Cap an absence finding at MEDIUM: a missing keyword is never more than that. */
function aiAbsence(ctx: WebContext, check: Omit<PulseScanCheckInput, "confidence">): PulseScanCheckInput {
  const result = absence(ctx, check);
  return result.confidence === "HIGH" ? { ...result, confidence: "MEDIUM" } : result;
}

function aiRepositoryReadinessChecks(ctx: WebContext): PulseScanCheckInput[] {
  const source = ctx.source;
  if (!/\b(?:openai|anthropic|chat\.completions|generateContent|useChat|languageModel)\b/i.test(source)) return [];
  const checks: PulseScanCheckInput[] = [];
  const signal = (key: string, label: string, pattern: RegExp, detail: string) => checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_READINESS, checkKey: key, label, status: pattern.test(source) ? "PASS" : "WARN", detail }));
  signal("pulse_ai_retry_policy", "AI requests use bounded retry policy", /\b(?:retry|backoff|maxRetries)\b/i, "AI request paths need bounded retries with backoff evidence.");
  // Not `fallback`: React's <Suspense fallback={…}> is in nearly every React app.
  signal("pulse_ai_failure_fallback", "AI failures have a user-safe fallback", /\b(?:fallbackModel|fallback_model|modelFallback|try again|graceful(?:ly)?|provider unavailable)\b/i, "AI request paths need an explicit user-safe fallback.");
  signal("pulse_ai_stream_cancel", "Streaming AI responses can be cancelled", /\b(?:AbortController|abort\(|cancel(?:led)?\b)\b/i, "Streaming AI paths need cancellation evidence.");
  signal("pulse_ai_evaluation_fixture", "AI changes have versioned evaluation fixtures", /\b(?:evals?|golden(?:set)?|benchmark|testCases)\b/i, "AI code needs versioned evaluation fixtures or benchmark evidence.");
  // Not bare `span`: that is the JSX <span> element.
  signal("pulse_ai_monitoring", "AI requests emit operational telemetry", /\b(?:trace|startSpan|startActiveSpan|span\.end|metrics|observability|telemetry|experimental_telemetry|langfuse|helicone|langsmith)\b/i, "AI request paths need trace, metric, or telemetry evidence.");
  // max_tokens / maxOutputTokens are the real SDK parameter names.
  signal("pulse_ai_cost_budget", "AI requests enforce cost or token budgets", /\b(?:maxTokens|max_tokens|maxOutputTokens|max_output_tokens|max_completion_tokens|tokenBudget|costBudget|usageLimit)\b/i, "AI request paths need token or cost-budget evidence.");
  signal("pulse_ai_feedback_capture", "AI output feedback is captured for review", /\b(?:feedback|thumbs(?:Up|Down)?|rating|regenerate)\b/i, "AI output paths need feedback-capture evidence.");
  signal("pulse_ai_model_version", "AI model and prompt versions are recorded", /\b(?:modelVersion|promptVersion|model:\s*["'`])\b/i, "AI request paths need model or prompt version evidence.");
  return checks;
}

const SERVER_FRAMEWORK_DEPS = /^(?:next|express|fastify|koa|hono|@hapi\/hapi|@nestjs\/core|@remix-run\/(?:node|react)|nuxt|@sveltejs\/kit|astro|@builder\.io\/qwik-city)$/;
const SPA_BUNDLER_DEPS = /^(?:vite|react-scripts|@vitejs\/plugin-react|parcel)$/;

/**
 * Does this file ship to the browser? Only three things establish that from a
 * repo: a `"use client"` directive, a browser-only directory, or a pure SPA
 * (Vite / CRA with no server framework) where everything under src/ is bundled.
 * A Next/Express/SvelteKit route handler is server code, and a system prompt
 * there is exactly where it belongs.
 */
export function shipsToBrowser(path: string, text: string, pkg: PackageManifest | null): boolean {
  if (/\.(?:py|rb|php|go|java|cs)$/i.test(path)) return false;
  if (/^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text)) return true;
  if (/(^|\/)(?:public|static|client|frontend|browser)\//i.test(path)) return true;
  if (/(^|\/)(?:api|server|functions|lambda|backend)\//i.test(path) || /(^|\/)route\.[cm]?[jt]s$/i.test(path)) return false;
  const spa = anyDependency(pkg, SPA_BUNDLER_DEPS) && !anyDependency(pkg, SERVER_FRAMEWORK_DEPS);
  return spa && /(^|\/)src\//i.test(path) && /\.[cm]?[jt]sx?$/i.test(path);
}

/** Retrieval calls, and the window after each one in which a scope would be written. */
const RETRIEVAL_CALL = /(?:\b(?:similaritySearch(?:WithScore)?|maxMarginalRelevanceSearch|asRetriever|vectorStore\.(?:search|query)|(?:index|namespace|collection)\.query)|\.rpc(?=\s*\(\s*["'`]match_\w+))\s*\(/gi;
const RETRIEVAL_SCOPE = /\b(?:filter|where|namespace|tenant\w*|user_?id|userId|org(?:anization)?_?id|organizationId|workspace_?id|workspaceId|account_?id|accountId|owner_?id|ownerId|metadata)\b/i;

/** Files where a retrieval call has no scope term in the call that follows it. */
function unscopedRetrievalSites(ctx: WebContext): string[] {
  const hits: string[] = [];
  for (const [path, raw] of ctx.files) {
    const text = stripCStyleComments(raw);
    RETRIEVAL_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RETRIEVAL_CALL.exec(text))) {
      // The call's own argument list, bounded: the scope belongs IN the query.
      const window = text.slice(m.index, m.index + m[0].length + 240);
      const close = callExtent(window, m[0].length);
      if (!RETRIEVAL_SCOPE.test(window.slice(0, close))) { hits.push(path); break; }
    }
  }
  return hits;
}

/** Index just past the `)` that closes the call opened at `openAt - 1`, or the window end. */
function callExtent(text: string, openAt: number): number {
  let depth = 1;
  for (let i = openAt; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i + 1;
  }
  return text.length;
}

function siteList(paths: string[]): string {
  const shown = paths.slice(0, MAX_SITES_QUOTED);
  const more = paths.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` (+${more} more)` : "");
}

function aiRepositorySafetyChecks(ctx: WebContext): PulseScanCheckInput[] {
  if (!AI_USAGE.test(ctx.source)) return [];
  const checks: PulseScanCheckInput[] = [];

  // A provider key literal is observed, not inferred. Leading boundary so that
  // `risk-assessment-dashboard` is not read as `sk-assessment-dashboard`, and
  // AIzaSy is NOT here: that is every Firebase web config and Maps key, public by design.
  const secret = sitesMatching(ctx, /(?<![A-Za-z0-9_-])(?:sk-(?:proj-|ant-(?:api\d+-)?)?[A-Za-z0-9_-]{32,})(?![A-Za-z0-9_-])/);
  if (secret.count) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_client_secret", label: "AI provider credentials stay server-side", status: "FAIL", confidence: "HIGH", detail: "An OpenAI/Anthropic-format secret key is committed in application source. Rotate it and load it from server-side configuration.", evidence: secret.where });

  // A long system instruction is only "client-readable" in a file that ships to
  // the browser. In a route handler it is where it belongs, so say nothing.
  const PROMPT = /(?:role\s*:\s*["'`](?:system|developer)["'`]\s*,\s*content\s*:|\bsystem(?:Prompt|Message|Instruction)?\s*[:=])\s*["'`][^"'`]{80,}/i;
  const clientPromptFiles = [...ctx.files].filter(([path, text]) => shipsToBrowser(path, text, ctx.pkg) && PROMPT.test(stripCStyleComments(text))).map(([p]) => p);
  if (clientPromptFiles.length) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_client_prompt", label: "Long system instructions stay server-side", status: "WARN", confidence: "MEDIUM", detail: "A long system instruction sits in a file that ships to the browser, so any visitor can read it. Prompts are not secrets, but anything that relies on the user not seeing them (hidden rules, internal notes, the shape of a tool) should move to a server route.", evidence: siteList(clientPromptFiles) });

  // Model-chosen arguments handed straight to a shell or eval is the concrete
  // unsafe tool. Any other exec/spawn inside tool code is a "confirm" WARN.
  const unsafeDirect = sitesMatching(ctx, /\b(?:exec|execSync|spawn|spawnSync|eval)\s*\(\s*(?:(?:toolCall|call|tool|args|toolArgs|input|params)\.(?:args|arguments|input|command|cmd|code|function\.arguments)\b|JSON\.parse\(\s*[\w.]*arguments\s*\))/i);
  const toolExec = sitesMatching(ctx, /(?:\btoolCalls?\b|\bfunction_call\b|\btool\s*\(\s*\{|\bexecute\s*:\s*async)[\s\S]{0,240}\b(?:exec|execSync|spawn|spawnSync|eval)\s*\(/i);
  if (unsafeDirect.count) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_unsafe_tool", label: "AI tool calls validate arguments before execution", status: "FAIL", confidence: "MEDIUM", detail: "Arguments chosen by the model are passed directly to a shell or eval call. A prompt-injected instruction can run commands on the server. Validate the arguments against a strict schema and an allow-list first.", evidence: unsafeDirect.where });
  else if (toolExec.count) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_unsafe_tool", label: "AI tool calls validate arguments before execution", status: "WARN", confidence: "MEDIUM", detail: "AI tool code runs a shell or eval call. Pulse cannot follow the data to tell whether the model controls its input; confirm the arguments are validated and allow-listed before execution.", evidence: toolExec.where });

  const unscoped = unscopedRetrievalSites(ctx);
  if (unscoped.length) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_unscoped_retrieval", label: "AI retrieval applies user or tenant scope", status: "WARN", confidence: "MEDIUM", detail: "A vector/retrieval query passes no filter, namespace, or user/tenant scope in its arguments. If one index holds more than one customer's data, a user can retrieve another's. Confirm the scope is applied, or add a filter on the authenticated user/tenant.", evidence: siteList(unscoped) });

  if (/\b(?:toolCall|function_call)\b/i.test(ctx.source)) checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_tool_confirmation", label: "High-impact AI tool calls require confirmation", status: /\b(?:confirm|approval|humanReview)\b/i.test(ctx.source) ? "PASS" : "WARN", detail: "Tool-call code needs explicit confirmation or approval evidence for consequential actions." }));
  checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_output_schema", label: "AI outputs are schema-validated before use", status: /\b(?:zod|safeParse|schema\.parse|json_schema|structuredOutput|generateObject|streamObject)\b/i.test(ctx.source) ? "PASS" : "WARN", detail: "AI code needs schema-validation evidence before output is rendered, persisted, or executed." }));
  checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_budget_timeout", label: "AI requests have budget and timeout limits", status: /\b(?:maxTokens|max_tokens|maxOutputTokens|tokenBudget|timeout|AbortController|rateLimit)\b/i.test(ctx.source) ? "PASS" : "WARN", detail: "AI request paths need token-budget, timeout, or rate-limit evidence." }));
  checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_audit_log", label: "AI tool decisions create auditable records", status: /\b(?:auditLog|audit\.log|toolAudit|decisionLog)\b/i.test(ctx.source) ? "PASS" : "WARN", detail: "AI tool or decision paths need privacy-safe audit-record evidence." }));
  return checks;
}

/**
 * Raw-HTML sites (`dangerouslySetInnerHTML`, `.innerHTML =`, `insertAdjacentHTML`),
 * split by what they render. Safe: a string literal with no `${…}`, `JSON.stringify(…)`,
 * or a sanitiser call. Unsafe: anything else, which is a value built at runtime.
 */
export function rawHtmlSites(files: Map<string, string>): { safe: number; unsafe: { path: string }[] } {
  const SAFE_VALUE = /^(?:(["'])(?:\\.|(?!\1)[^\\\n])*\1|`[^`$]*`|JSON\.stringify\s*\(|(?:DOMPurify\s*\.\s*)?sanitize(?:Html)?\s*\(|sanitizeHtml\s*\(|xss\s*\()/;
  let safe = 0;
  const unsafe: { path: string }[] = [];
  for (const [path, raw] of files) {
    const text = stripCStyleComments(raw);
    const values: string[] = [];
    for (const m of text.matchAll(/dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*/g)) values.push(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200));
    for (const m of text.matchAll(/\.(?:innerHTML|outerHTML)\s*=(?!=)\s*/g)) values.push(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200));
    for (const m of text.matchAll(/insertAdjacentHTML\s*\(\s*[^,]+,\s*/g)) values.push(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200));
    for (const v of values) {
      if (SAFE_VALUE.test(v.trim())) safe++;
      else unsafe.push({ path });
    }
  }
  return { safe, unsafe };
}

// ── Injection & unsafe code ─────────────────────────────────────────────────
function injectionChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // The single most common finding in AI-built React apps. Deliberately NOT a
  // FAIL on its own: rendering trusted, sanitised markup this way is legitimate,
  // and a scanner that fails every use is one people learn to ignore.
  // Judged per site (rawHtmlSites): markup that is a constant, JSON.stringify output
  // (the standard Next.js JSON-LD `<script type="application/ld+json">` pattern), or
  // passed through a sanitiser cannot carry a user's HTML, so it is not counted.
  const html = rawHtmlSites(ctx.files);
  if (html.unsafe.length > 0) {
    const sanitises = /DOMPurify|sanitize-html|xss\b|sanitizeHtml/i.test(
      ctx.source + JSON.stringify(ctx.pkg?.dependencies ?? {}),
    );
    const files = [...new Set(html.unsafe.map((h) => h.path))];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_raw_html_injection",
      label: "Raw HTML is sanitised before rendering",
      status: sanitises ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail: sanitises
        ? `Raw HTML is rendered from a value built at runtime in ${files.length} file(s), and a sanitiser (DOMPurify / ` +
          `sanitize-html) is present in this project. Confirm EVERY site that can receive user or remote content ` +
          `passes through it — a sanitiser in the dependency list is not the same as a sanitiser on this code path.`
        : `\`dangerouslySetInnerHTML\` or a raw \`innerHTML\` assignment renders a value built at runtime in ` +
          `${files.length} file(s), with no HTML sanitiser anywhere in the project. If any of that markup can contain ` +
          `something a user typed (a comment, a profile field, a name, anything round-tripped through your API), it ` +
          `is a cross-site-scripting hole, and the attacker's script runs with your users' session. Render text as ` +
          `text, and pass unavoidable HTML through DOMPurify.`,
      evidence: files.slice(0, 5).join(", ").slice(0, 200) || undefined,
    });
  } else if (html.safe > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_raw_html_injection",
      label: "Raw HTML is sanitised before rendering",
      status: "PASS",
      confidence: "MEDIUM",
      detail: `${html.safe} raw HTML site(s) found, each rendering a constant, \`JSON.stringify\` output or a ` +
        `sanitised value, none of which can carry a user's markup.`,
    });
  }

  // ── SQL assembled by string building ───────────────────────────────────────
  //
  // ⚠️ Three rules here, all learned by running this family against a real
  // TypeScript codebase rather than a fixture. As first written it reported
  // three Prisma-only API routes as SQL injection, at FAIL, in Security — which
  // under the release gate can BLOCK a launch on a false positive.
  //
  // 1. THE BODY CANNOT CROSS A NEWLINE. `[^"']*` had no bound, so the "string
  //    literal" it believed it was inside ran for hundreds of lines of ordinary
  //    code. A single- or double-quoted string cannot contain a raw newline in
  //    any of these languages, so excluding it is not a heuristic — it is the
  //    grammar. Template literals may span lines, so those are length-bounded
  //    instead.
  //
  // 2. THE `f` PREFIX NEEDS A WORD BOUNDARY. `f["']` matched the closing quote
  //    of any string ending in the letter f — `role: "STAFF"` being the
  //    commonest possible case in a web app. A Python f-string prefix is a
  //    standalone token.
  //
  // 3. ONE SQL KEYWORD IS NOT EVIDENCE OF SQL. `where`, `from`, `select`,
  //    `update`, `delete` and `values` are all ordinary words in web code:
  //    Prisma's `where:`/`select:`, `import … from`, a `<select>` element, a
  //    `deleteUser()` helper. So the rule requires a STATEMENT SHAPE — the
  //    keyword pairings that essentially only co-occur in SQL. That trades a
  //    little recall for precision on purpose: a scanner that fires on every
  //    React app is worse than no scanner, and a bare `" WHERE id = " + id`
  //    fragment is the recall this deliberately gives up.
  // 4. THE OTHER QUOTE CHARACTER IS ORDINARY CONTENT. `[^"']` cannot cross the
  //    apostrophe in `"… WHERE email = '" + email`, which is the single
  //    commonest real injection shape there is — so the strict class silently
  //    dropped the true positive it most needed to catch. Built per quote style
  //    instead, exactly as §34.6 had to learn for Dart.
  //
  // 5. THE INTERPOLATION MUST LAND IN A VALUE POSITION. Fixing (4) alone lets
  //    ordinary English through: `"Select an item from the list " + name` has
  //    SELECT…FROM in a concatenated string and is a UI label. Real SQL breaks
  //    at a value — after `=`, `(`, `,`, `FROM`, `INTO`, `IN (`, `LIKE`, `SET`,
  //    `VALUES (`. Prose breaks mid-sentence. That is the discriminator, and it
  //    is why the tests below carry as many negative cases as positive ones.
  const body = (quote: string) => `[^${quote}\\n]`;
  const tpl = "[^`]";
  const sqlShape = (chars: string) =>
    "(?:" +
    `\\bSELECT\\b${chars}{0,200}?\\bFROM\\b` +
    "|\\bINSERT\\s+INTO\\b" +
    "|\\bDELETE\\s+FROM\\b" +
    `|\\bUPDATE\\b${chars}{0,200}?\\bSET\\b` +
    "|\\bVALUES\\s*\\(" +
    ")";
  /** Where a value would go in a real statement — immediately before the hole. */
  const valuePoint =
    "(?:=\\s*['\"`]?|\\(\\s*['\"`]?|,\\s*['\"`]?|\\bFROM\\s+|\\bINTO\\s+|\\bIN\\s*\\(\\s*|\\bLIKE\\s*['\"`]?%?|\\bSET\\s+\\w+\\s*=\\s*['\"`]?|\\bVALUES\\s*\\(\\s*['\"`]?)";
  /** A literal placeholder, which prose never contains. Used for %/format(). */
  const placeholder = "(?:%[sdif]|\\{\\d*\\}|\\{\\w+\\})";

  const sqlPatterns: Array<[RegExp, string]> = [];
  for (const quote of ['"', "'"]) {
    const c = body(quote);
    const shape = sqlShape(c);
    sqlPatterns.push(
      [new RegExp(`(?:^|[^A-Za-z0-9_])f${quote}${c}{0,200}?${shape}${c}{0,200}?${valuePoint}\\{`, "i"), "Python f-string"],
      [new RegExp(`${quote}${c}{0,200}?${shape}${c}{0,200}?${placeholder}${c}{0,200}?${quote}\\s*\\.\\s*format\\s*\\(`, "i"), "str.format()"],
      [new RegExp(`${quote}${c}{0,200}?${shape}${c}{0,200}?${valuePoint}${quote}\\s*\\+\\s*\\w`, "i"), "string concatenation"],
      [new RegExp(`${quote}${c}{0,200}?${shape}${c}{0,200}?${placeholder}${c}{0,200}?${quote}\\s*%\\s*\\(?\\w`, "i"), "%-formatting"],
    );
  }
  // 6. A TAGGED template parameterises by construction: Prisma `$queryRaw\`…${id}\``,
  //    postgres.js / slonik / drizzle `sql\`…${x}\`` send each `${…}` as a bound value.
  //    The tag sits immediately before the backtick, so an untagged template is one not
  //    preceded by an identifier, `)`, `]` or `.`. `$queryRawUnsafe(\`…\`)` is not tagged.
  sqlPatterns.push([
    new RegExp(`(?<![\\w$)\\].]\\s*)\`${tpl}{0,300}?${sqlShape(tpl)}${tpl}{0,300}?${valuePoint}\\$\\{`, "i"),
    "template literal",
  ]);
  const found = sqlPatterns.filter(([re]) => re.test(ctx.source));
  if (found.length > 0) {
    const combined = new RegExp(sqlPatterns.map(([re]) => re.source).join("|"), "i");
    const sites = sitesMatching(ctx, combined);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_sql_string_building",
      label: "SQL queries are parameterised",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `SQL appears to be assembled by ${found.map(([, name]) => name).join(" and ")} in ${sites.count} file(s). ` +
        `Any value interpolated that way becomes part of the query rather than data, so a single crafted input can ` +
        `read other users' rows, or drop the table. Pass values as query PARAMETERS (\`?\` / \`$1\` placeholders, or ` +
        `your ORM's binding) — the driver then sends them separately from the statement and no escaping is needed. ` +
        `Note that "user input" here includes anything your own API returned, not just form fields.`,
      evidence: sites.where.slice(0, 200) || undefined,
    });
  }

  // Dynamic code execution. Presence is the finding — there is essentially no
  // benign reason for eval on a web service.
  // `.eval(` on an arbitrary object is a method (Redis Lua EVAL, torch model.eval()),
  // not the language's eval. Bare eval and the receivers that ARE the global/binding
  // eval stay matched — not `self`, which in Python is any instance (`self.eval()` on a
  // torch Module, an interpreter's own `self.eval(expr, env)`), and never a zero-argument
  // `eval()`, which evaluates nothing. Same for `.exec("…")`: `/re/.exec("x")` is a regex match, not
  // Python's exec.
  const evalSites = sitesMatching(
    ctx,
    /(?<![\w.$])eval\s*\((?!\s*\))|\b(?:window|globalThis|top|parent|Kernel|binding|TOPLEVEL_BINDING|builtins|__builtins__)\.eval\s*\((?!\s*\))|new\s+Function\s*\(|(?<![\w.$])exec\s*\(\s*["'`]/,
  );
  if (evalSites.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_dynamic_code_execution",
      label: "No dynamic code execution",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `\`eval\` or \`new Function\` (or \`exec\` on a string) appears in ${evalSites.count} file(s). If any part ` +
        `of that string can be influenced from outside, it is arbitrary code execution in your process — with your ` +
        `database credentials and your environment. Almost every real use has a direct replacement: \`JSON.parse\` ` +
        `for data, a lookup table for dispatch, a real parser for expressions.`,
      evidence: evalSites.where.slice(0, 200) || undefined,
    });
  }

  // Shell execution built from a variable.
  //
  // ⚠️ Bounded on purpose, and this is the general rule the SQL bug above
  // taught. A pattern that OPENS on a quote and TERMINATES on something that is
  // not the matching quote — `${` here, `{` there — is never bounded by quote
  // parity, so an unbounded body runs until it happens to find the terminator
  // anywhere later in the file. (Patterns that close on their own quote are
  // self-limiting: with one quote character the quotes alternate, so the span
  // can only end at the literal's own closing quote. That is why the same shape
  // in the mobile families is not a live defect and was left alone.)
  const shellSites = sitesMatching(
    ctx,
    /shell\s*=\s*True|child_process[\s\S]{0,60}\bexec\s*\(\s*[`'"][^`'"\n]{0,200}?\$\{|\bexec\s*\(\s*`[^`]{0,200}?\$\{|os\.system\s*\(/,
  );
  if (shellSites.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_shell_injection",
      label: "Shell commands are not built from variables",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A shell command appears to be built from an interpolated value (\`shell=True\`, \`os.system\`, or ` +
        `\`exec\` with a template literal) in ${shellSites.count} file(s). The shell then interprets metacharacters, ` +
        `so a value containing \`;\`, \`|\` or backticks runs a second command as your service. Use the argument-array ` +
        `form — \`execFile\`/\`spawn\` in Node, \`subprocess.run([...])\` without \`shell=True\` in Python — which ` +
        `passes arguments to the program directly and never involves a shell.`,
      evidence: shellSites.where.slice(0, 200) || undefined,
    });
  }

  // Unsafe deserialisation — pickle and yaml.load are remote code execution by
  // design when fed untrusted data.
  const deserialise = sitesMatching(ctx, /pickle\.loads?\s*\(|yaml\.load\s*\((?![^)]*SafeLoader)|marshal\.loads?\s*\(/);
  if (deserialise.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_unsafe_deserialization",
      label: "Deserialisation is safe by construction",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `\`pickle.load\`, \`marshal.load\` or \`yaml.load\` without \`SafeLoader\` appears in ${deserialise.count} ` +
        `file(s). These formats can encode arbitrary Python objects, so deserialising untrusted data executes ` +
        `attacker-chosen code — it is not a parsing bug, it is the documented behaviour. Use \`yaml.safe_load\`, and ` +
        `JSON instead of pickle for anything that crosses a trust boundary.`,
      evidence: deserialise.where.slice(0, 200) || undefined,
    });
  }

  return checks;
}

// ── Credentials in the repository ───────────────────────────────────────────
function credentialChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // A .gitignore that EXISTS but does not cover .env. Pulse could previously only
  // see whether the file was present, which passes this case — and it is the
  // second most common finding in AI-built repos.
  if (ctx.gitignore) {
    const coversEnv = /^\s*\*?\.?env/im.test(ctx.gitignore) || /^\s*\*\.env/im.test(ctx.gitignore);
    const envPaths = ctx.paths.filter((p) => /(^|\/)\.env($|\.[a-z]+$)/i.test(p) && !/\.example$|\.sample$|\.template$/i.test(p));
    // Two committed shapes whose CONTENTS we have not read and which are usually not secrets:
    // a path the .gitignore deliberately re-includes with `!path` (cal.com's
    // `!packages/prisma/.env` is a symlink to the ignored root .env), and `.env.test`, which
    // frameworks such as Next.js document as safe to commit. Reported as "confirm", not "rotate".
    const reIncluded = (p: string) =>
      ctx.gitignore.split("\n").some((l) => l.trim().startsWith("!") && l.trim().replace(/^!\/?/, "") === p);
    const envCommitted = envPaths.some((p) => !reIncluded(p) && !/(^|\/)\.env\.test$/i.test(p));
    const envDeliberate = envPaths.length > 0 && !envCommitted;
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "web_gitignore_covers_env",
      label: ".gitignore excludes environment files",
      status: envCommitted ? "FAIL" : envDeliberate ? "WARN" : coversEnv ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: envCommitted
        ? `A \`.env\` file is committed to this repository. Everything in it should be treated as public — git history ` +
          `preserves it even after deletion, and forks and clones already have it. Rotate every credential it ` +
          `contains at the provider, then add \`.env\` to .gitignore and remove it with \`git rm --cached\`.`
        : envDeliberate
          ? `An environment file is tracked (${envPaths.slice(0, 3).join(", ")}), but only as a test-config file or a ` +
            `path the .gitignore deliberately re-includes — often a symlink to the ignored real file. Its contents were ` +
            `not read: confirm it holds no live credentials.`
        : coversEnv
          ? `\`.gitignore\` covers environment files.`
          : `A \`.gitignore\` exists but has no \`.env\` rule. Nothing is exposed today, but the next person to create ` +
            `a local \`.env\` — or the next AI-assisted change that scaffolds one — commits it without a warning. ` +
            `This is the second most common finding in AI-built repositories precisely because the file being present ` +
            `looks like the job is done. Add \`.env\` and \`.env.*\` (excepting \`.env.example\`).`,
    });
  }

  // A password literal in source. Distinct from the secret scanner's key formats:
  // a password has no recognisable prefix, so entropy/format rules miss it.
  const pwSites = sitesMatching(
    ctx,
    /(password|passwd|pwd)\s*[:=]\s*["'][^"'\s]{6,}["']/i,
  );
  if (pwSites.count > 0) {
    const looksLikePlaceholder = /["'](changeme|password|your[_-]?password|xxx+|\.\.\.|<[^>]+>|example)["']/i.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "web_hardcoded_password",
      label: "No hardcoded passwords in source",
      status: looksLikePlaceholder ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail: looksLikePlaceholder
        ? `Password literals appear in ${pwSites.count} file(s), and at least one looks like a placeholder. Confirm ` +
          `none of the others is real — a placeholder next to a live credential is the usual shape of this finding.`
        : `A password literal appears in ${pwSites.count} file(s). Unlike an API key, a password has no distinctive ` +
          `prefix, so it slips past secret-scanning rules that look for known formats — which is why these survive in ` +
          `repositories long after the keys have been cleaned up. Move it to an environment variable, and rotate it ` +
          `first if this repository is public or has ever been.`,
      evidence: pwSites.where.slice(0, 200) || undefined,
    });
  }

  // Supabase RLS from the REPO side. Pulse already checks this from a live URL;
  // this catches it in the migrations, before anything is deployed.
  const usesSupabase = anyDependency(ctx.pkg, /^@supabase\//) || /supabase/i.test(ctx.source);
  if (usesSupabase && ctx.sql) {
    const enablesRls = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(ctx.sql);
    const permissive = /USING\s*\(\s*true\s*\)/i.test(ctx.sql);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_supabase_rls_migrations",
      label: "Row-level security is enabled in migrations",
      status: !enablesRls ? "FAIL" : permissive ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: !enablesRls
        ? `This project uses Supabase and its committed SQL contains no \`ENABLE ROW LEVEL SECURITY\`. Supabase ships ` +
          `the anon key to the browser BY DESIGN — it is meant to be public — and row-level security is the only ` +
          `thing standing between that key and your tables. Without it the key is a read (and often write) pass to ` +
          `every row. AI builders skip this because the app works either way: RLS off produces a working preview, ` +
          `RLS on makes queries fail until policies exist, which looks like breakage.`
        : permissive
          ? `RLS is enabled, but a policy uses \`USING (true)\`, which passes every row. That is security theatre — ` +
            `the table reports as protected while remaining fully readable. Scope policies to the caller, e.g. ` +
            `\`auth.uid() = user_id\`, for select, insert, update and delete separately.`
          : `Row-level security is enabled in the committed migrations with scoped policies.`,
    });
  }

  return checks;
}

// ── Framework defaults left in production ───────────────────────────────────
function frameworkDefaultChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Debug mode. Its production cost is a full stack trace and often an
  // interactive console on every error page.
  // A settings module that is dev/local/test BY NAME is where `DEBUG = True` belongs
  // (djangoproject.com: settings/dev.py has it, settings/prod.py reads an env var that
  // defaults to false). Only files that can reach production are evidence.
  // NOT `settings_local.py` / `local_settings.py`: by convention that is the per-deployment
  // override file, which is exactly what runs in production.
  const DEV_ONLY_SETTINGS = /(^|\/)(?:dev|development|local|test|tests|testing|settings_(?:dev|test))\.py$/i;
  const debugOn = sitesMatching(
    { ...ctx, files: new Map([...ctx.files].filter(([p]) => !DEV_ONLY_SETTINGS.test(p))) },
    /DEBUG\s*=\s*True|debug\s*=\s*True|app\.run\([^)]*debug\s*=\s*True/,
  );
  if (debugOn.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_debug_mode_enabled",
      label: "Framework debug mode is off",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `\`DEBUG = True\` appears in ${debugOn.count} committed file(s). In Django and Flask this turns every error ` +
        `into a full traceback with local variables and settings — and Flask's debugger exposes an interactive Python ` +
        `console on the error page. Both leak your configuration to anyone who can trigger an exception. Drive it ` +
        `from an environment variable that defaults to OFF, so forgetting to set it fails safe rather than open.`,
      evidence: debugOn.where.slice(0, 200) || undefined,
    });
  }

  // ALLOWED_HOSTS = ['*'] permits Host-header attacks (cache poisoning, password
  // reset links pointing at an attacker's domain).
  if (/ALLOWED_HOSTS\s*=\s*\[[^\]]*["']\*["']/.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_allowed_hosts_wildcard",
      label: "ALLOWED_HOSTS is not a wildcard",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`ALLOWED_HOSTS = ['*']\` accepts any Host header. Django uses that header to build absolute URLs — so a ` +
        `request with a forged Host produces a password-reset email pointing at the attacker's domain, and poisons ` +
        `any cache keyed on the response. List your real domains instead.`,
    });
  }

  // JWT verification disabled or the `none` algorithm accepted.
  const jwtWeak = sitesMatching(
    ctx,
    /verify_signature["']?\s*:\s*False|verify\s*[:=]\s*False|algorithms\s*=\s*\[[^\]]*["']none["']|["']alg["']\s*:\s*["']none["']/i,
  );
  if (jwtWeak.count > 0) {
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "web_jwt_verification",
      label: "JWT signatures are verified",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `JWT signature verification appears to be disabled, or the \`none\` algorithm accepted, in ${jwtWeak.count} ` +
        `file(s). A token is only a credential because it is signed — without verification anyone can mint one ` +
        `claiming to be any user, including an administrator, by editing the payload in a text editor. Verify with ` +
        `an explicit algorithm allow-list; never let the token's own header choose it.`,
      evidence: jwtWeak.where.slice(0, 200) || undefined,
    });
  }

  // Wildcard CORS with credentials, read from SOURCE. The API-behaviour family
  // probes a live URL; this catches it in a repo that is not deployed yet.
  const corsWildcard = /origin\s*[:=]\s*["']\*["']|cors\s*\(\s*\{[^}]*origin\s*:\s*true/i.test(ctx.source);
  const corsCredentials = /credentials\s*[:=]\s*(true|True)/.test(ctx.source);
  if (corsWildcard) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_cors_source_config",
      label: "CORS configuration names specific origins",
      status: corsCredentials ? "FAIL" : "WARN",
      confidence: "MEDIUM",
      detail: corsCredentials
        ? `The CORS configuration allows any origin AND enables credentials. That combination means any website a ` +
          `logged-in user visits can call your API as them and read the response. Replace the wildcard with an ` +
          `explicit allow-list — a permissive callback such as \`origin: true\` reflects whatever was sent, which is ` +
          `the same hole written differently.`
        : `The CORS configuration allows any origin. That is acceptable for genuinely public, unauthenticated data — ` +
          `confirm nothing behind this API relies on cookies or an Authorization header, because switching ` +
          `credentials on later turns this into a full account-data exposure with no other change.`,
    });
  }

  // Express without helmet: no security headers at all by default.
  const isExpress = anyDependency(ctx.pkg, /^(express|fastify|koa)$/);
  if (isExpress) {
    const hasHelmet = anyDependency(ctx.pkg, /^(helmet|@fastify\/helmet|koa-helmet)$/) || /helmet\s*\(/.test(ctx.source);
    checks.push(absence(ctx, {
      category: CATEGORIES.SECURITY,
      checkKey: "web_security_headers_middleware",
      label: "Security-header middleware is installed",
      status: hasHelmet ? "PASS" : "WARN",
      detail: hasHelmet
        ? `Security-header middleware (helmet) is present.`
        : `This is an Express/Fastify/Koa service with no \`helmet\` middleware. These frameworks send NO security ` +
          `headers by default — no CSP, no HSTS, no \`X-Content-Type-Options\`, and Express additionally advertises ` +
          `itself via \`X-Powered-By\`. One \`app.use(helmet())\` sets a sensible baseline for all of them.`,
    }));
  }

  return checks;
}

// ── Transport ───────────────────────────────────────────────────────────────
function transportChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  const tlsOff = sitesMatching(
    ctx,
    /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)/i,
  );
  if (tlsOff.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_tls_verification_disabled",
      label: "TLS certificate verification is enabled",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `Certificate verification is disabled in ${tlsOff.count} file(s) (\`verify=False\`, ` +
        `\`rejectUnauthorized: false\`, \`InsecureSkipVerify\` or equivalent). This removes the entire point of ` +
        `HTTPS for those requests: the connection is still encrypted, but to whoever answered — so anyone on the ` +
        `network path can substitute themselves and read and rewrite the traffic. It is nearly always added to get ` +
        `past a self-signed certificate in development; add that certificate to the trust store instead.`,
      evidence: tlsOff.where.slice(0, 200) || undefined,
    });
  }

  const plainHttp = sitesMatching(ctx, /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[a-z0-9.-]+\.[a-z]{2,}/i);
  if (plainHttp.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_plaintext_api_calls",
      label: "Outbound API calls use HTTPS",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `A plain \`http://\` URL to an external host appears in ${plainHttp.count} file(s). Any request sent that way ` +
        `— including whatever API key or token it carries — is readable and modifiable by anyone on the network path. ` +
        `Localhost URLs are excluded from this finding; these are not.`,
      evidence: plainHttp.where.slice(0, 200) || undefined,
    });
  }

  return checks;
}

// ── Supply chain ────────────────────────────────────────────────────────────
function supplyChainChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // curl | sh in the README or a setup script.
  if (/curl\s+[^\n|]*\|\s*(sudo\s+)?(ba)?sh|wget\s+[^\n|]*\|\s*(sudo\s+)?(ba)?sh/i.test(ctx.docsAndScripts)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_curl_pipe_shell",
      label: "Setup does not pipe a remote script into a shell",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The setup instructions or a committed script pipe a downloaded file straight into a shell ` +
        `(\`curl … | sh\`). Whoever controls that URL — today, or after it expires and is re-registered — runs code ` +
        `on the machine of everyone who follows your README, with their privileges. It also cannot be reviewed or ` +
        `pinned. Download to a file, pin a version and a checksum, or install through a package manager.`,
    });
  }

  // Unpinned dependency specifiers.
  const deps = { ...(ctx.pkg?.dependencies ?? {}), ...(ctx.pkg?.devDependencies ?? {}) };
  const loose = Object.entries(deps).filter(([, v]) =>
    typeof v === "string" && (v === "*" || v === "latest" || /^(git\+|https?:)/.test(v)),
  );
  if (ctx.pkg) {
    const hasLockfile = ctx.paths.some((p) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(p));
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_dependency_pinning",
      label: "Dependencies are pinned and locked",
      status: loose.length > 0 ? "WARN" : hasLockfile ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: loose.length > 0
        ? `${loose.length} dependency specifier(s) are unpinned — \`*\`, \`latest\`, or a raw git/http URL ` +
          `(${loose.slice(0, 3).map(([k]) => k).join(", ")}). ` +
          (hasLockfile
            ? `The committed lockfile holds today's resolution, but the next lockfile refresh pulls whatever is newest, ` +
              `so a compromised release arrives as a lockfile diff nobody reads. A raw URL is worse `
            : `Two builds of the same commit can then produce different applications, and a compromised release is ` +
              `pulled in with no diff to review. A raw URL is worse `) +
          `again: it has no registry integrity check at all.`
        : hasLockfile
          ? `Dependency versions are pinned and a lockfile is committed.`
          : `No lockfile is committed. Every install resolves ranges afresh, so the code CI tested is not necessarily ` +
            `the code that ships, and a compromised patch release of a transitive dependency arrives silently. ` +
            `Commit the lockfile and use \`npm ci\`.`,
      evidence: loose.length > 0 ? loose.slice(0, 5).map(([k, v]) => `${k}@${v}`).join(", ") : undefined,
    });
  }

  return checks;
}

// ── Pulse audit controls ───────────────────────────────────────────────────
// A package name alone is never evidence. Each Pulse control looks for an
// executable workflow, checked-in policy, or real test assertion. That is the
// difference between declaring an intention and protecting a release.
function automationChecks(ctx: WebContext): PulseScanCheckInput[] {
  if (!ctx.pkg && !ctx.automation && !ctx.sourceRaw) return [];
  const evidence = `${ctx.automation}\n${ctx.sourceRaw}\n${JSON.stringify(ctx.pkg?.devDependencies ?? {})}`;
  const has = (pattern: RegExp) => pattern.test(evidence);
  const checks: PulseScanCheckInput[] = [];

  const gates: Array<[string, string, RegExp, string, string]> = [
    ["pulse_static_analysis_gate", "Static analysis runs in CI", /\b(?:static[-_ ]analysis|sast|source[-_ ]analysis)\b|\bcodeql-action\/analyze\b|\bsemgrep(?:\/semgrep-action|\s+(?:ci|scan))\b|\bsonar(?:cloud|qube)?-(?:github-)?(?:scan|action)\b/i, "Static analysis is wired into the delivery workflow.", "No CI evidence of static analysis. We recommend running a source analyser (CodeQL, Semgrep, a linter with security rules) on every pull request."],
    ["pulse_static_analysis_policy", "Static-analysis rules are versioned", /\b(?:static[-_ ]analysis|sast)\b[\s\S]{0,240}\b(?:rules|policy|config(?:uration)?)\b|\b(?:rules|policy|config(?:uration)?)\b[\s\S]{0,240}\b(?:static[-_ ]analysis|sast)\b/i, "A checked-in static-analysis policy is present.", "No checked-in static-analysis policy evidence. Keep reviewable rules with the repository."],
    ["pulse_static_analysis_blocking", "Static-analysis findings block unsafe changes", /\b(?:static[-_ ]analysis|sast)\b[\s\S]{0,240}\b(?:fail|block|threshold|severity|critical|high)\b/i, "The static-analysis workflow includes blocking criteria.", "No evidence that static-analysis findings block a merge or release."],
    ["pulse_secret_scan_gate", "Secret scanning runs in CI", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b|\bgitleaks(?:\/gitleaks-action|\s+(?:detect|protect|git|dir))\b|\btrufflesecurity\/trufflehog\b|\btrufflehog\s+(?:git|filesystem|github)\b/i, "A secret-scanning workflow is present.", "No CI evidence of secret scanning. We recommend a secret scanner (gitleaks, TruffleHog, GitHub secret scanning) on every pull request."],
    ["pulse_secret_history_scope", "Secret scanning covers repository history", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b[\s\S]{0,240}\b(?:history|full[-_ ]repo|all[-_ ]commits|pull[-_ ]request)\b/i, "The secret scan includes repository-history or pull-request coverage.", "No evidence that secret scanning covers history or pull requests."],
    ["pulse_secret_remediation", "Secret findings have a remediation path", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b[\s\S]{0,240}\b(?:revoke|rotate|redact|remediate|incident)\b/i, "The repository documents how a secret finding is contained.", "No evidence of a documented revoke, rotation, or remediation path for secret findings."],
    ["pulse_supply_chain_gate", "Supply-chain risk scanning runs in CI", /\b(?:supply[-_ ]chain|dependency[-_ ]scan|iac[-_ ]scan|artifact[-_ ]scan)\b/i, "A supply-chain risk scan is wired into delivery.", "No CI evidence of dependency, infrastructure, or artifact risk scanning."],
    ["pulse_supply_chain_inventory", "A release inventory is generated", /\b(?:sbom|software[-_ ]bill[-_ ]of[-_ ]materials|release[-_ ]inventory)\b/i, "Release inventory generation is configured.", "No evidence that a release inventory is generated for shipped artifacts."],
    ["pulse_supply_chain_blocking", "Supply-chain risk has blocking thresholds", /\b(?:supply[-_ ]chain|dependency[-_ ]scan|iac[-_ ]scan|artifact[-_ ]scan)\b[\s\S]{0,240}\b(?:fail|block|threshold|severity|critical|high)\b|\b(?:npm|yarn(?: npm)?|pnpm|bun) audit\b(?![^\n]*\|\|\s*(?:true\b|:|exit\s+0\b))[^\n]*--(?:audit-level|severity)\b|\bfail-on-severity\s*:|\bsnyk test\b(?![^\n]*\|\|\s*(?:true\b|:|exit\s+0\b))[^\n]*--severity-threshold\b|\brun:\s*(?:[|>][-+]?\s*)?(?:pip-audit|osv-scanner)\b(?![^\n]*\|\|\s*(?:true\b|:|exit\s+0\b))/i, "Supply-chain workflow includes blocking criteria.", "No evidence that high-risk supply-chain findings block a release."],
    ["pulse_code_flow_gate", "Code-flow analysis runs in CI", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b|\bcodeql-action\/analyze\b/i, "A code-flow analysis workflow is present.", "No CI evidence of code-flow analysis for paths that simple pattern matching cannot judge."],
    ["pulse_code_flow_sources", "Code-flow analysis models untrusted inputs", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b[\s\S]{0,240}\b(?:source|untrusted|input|taint)\b|\bcodeql-action\/analyze\b/i, "The code-flow policy includes untrusted-input modelling.", "No evidence that code-flow analysis models untrusted inputs."],
    ["pulse_code_flow_sinks", "Code-flow analysis protects sensitive operations", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b[\s\S]{0,240}\b(?:sink|database|shell|html|network)\b|\bcodeql-action\/analyze\b/i, "The code-flow policy includes sensitive-operation coverage.", "No evidence that code-flow analysis covers sensitive operations."],
    ["pulse_browser_journeys", "Browser journeys run before release", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b/i, "Browser journey tests are wired into delivery.", "No CI evidence that critical user journeys run in a real browser."],
    ["pulse_browser_failure_evidence", "Browser failures retain diagnostic evidence", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b[\s\S]{0,240}\b(?:trace|screenshot|video|network[-_ ]log)\b(?!\s*:\s*["']?(?:off|false|never)\b)|\b(?:trace|screenshot|video)\s*:\s*["'](?:on|retain-on-failure|on-first-retry|on-all-retries|only-on-failure)["']|\bscreenshotOnRunFailure\s*:\s*true\b|\bupload-artifact\b[\s\S]{0,240}\b(?:playwright-report|blob-report|cypress\/(?:screenshots|videos))\b/i, "Browser failures retain reproducible diagnostic evidence.", "No evidence that browser failures retain traces, screenshots, video, or network logs."],
    ["pulse_browser_release_coverage", "Browser tests cover release-critical paths", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b[\s\S]{0,240}(?<![\w.-]|name:[ \t]*|(?:docker|podman|npm|az|helm|oras|auth)[ \t]+)(?:login|checkout|payment|signup|onboarding|critical)\b(?![-@\/])/i, "Browser tests name release-critical paths.", "No evidence that browser tests cover login, onboarding, payments, or other critical paths."],
    ["pulse_accessibility_assertions", "Accessibility assertions run with UI tests", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|toHaveNoViolations)\b/i, "Automated accessibility assertions run with UI tests.", "No CI evidence of automated accessibility assertions against rendered UI."],
    ["pulse_accessibility_keyboard", "UI tests verify keyboard operation", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|keyboard[-_ ]navigation|focus[-_ ]order)\b/i, "UI-test evidence includes keyboard or focus validation.", "No evidence that UI tests verify keyboard navigation or focus order."],
    ["pulse_accessibility_semantics", "UI tests verify accessible semantics", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|accessible[-_ ]name|role[-_ ]assertion|contrast[-_ ]check)\b/i, "UI-test evidence includes semantic or contrast validation.", "No evidence that UI tests verify accessible names, roles, or contrast."],
    ["pulse_dynamic_security_gate", "Dynamic security baseline runs before release", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b/i, "A dynamic web or API security baseline is wired into delivery.", "No CI evidence of dynamic web or API security testing before release. We recommend a DAST baseline (for example OWASP ZAP) against a staging or preview deployment, including signed-in paths."],
    ["pulse_dynamic_security_auth", "Dynamic security checks authenticated paths", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b[\s\S]{0,240}\b(?:auth(?:enticated)?|session|token|role)\b/i, "Dynamic security configuration covers authenticated behaviour.", "No evidence that dynamic security checks cover authenticated sessions or roles."],
    ["pulse_dynamic_security_isolation", "Dynamic security tests run against a safe target", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b[\s\S]{0,240}\b(?:staging|preview|sandbox|test[-_ ]environment)\b/i, "Dynamic security tests target an isolated environment.", "No evidence that dynamic security tests run against a safe staging, preview, sandbox, or test environment."],
  ];

  // A browser-test FILE named for a critical flow (login.e2e.ts, e2e/checkout.spec.ts)
  // is direct evidence of release-path coverage; keyword proximity in a workflow
  // (actions/checkout, docker/login-action) is not.
  const criticalBrowserTestPath = ctx.paths.some((p) => !isVendoredPath(p) &&
    /(?:^|\/)(?:e2e|playwright|cypress)\/(?:[^/]+\/)*[^/]*(?:login|sign-?up|checkout|payment|onboarding)[^/]*\.[jt]sx?$|(?:login|sign-?up|checkout|payment|onboarding)[^/]*\.(?:e2e|cy)\.[jt]sx?$/i.test(p));
  const staticAnalysisConfigPath = ctx.paths.some((p) => !isVendoredPath(p) &&
    /(^|\/)(?:\.eslintrc(?:\.(?:js|cjs|json|ya?ml))?|eslint\.config\.[cm]?[jt]s|\.rubocop\.yml|\.?ruff\.toml|\.semgrep\.ya?ml|\.golangci\.ya?ml|\.pylintrc|\.flake8|biome\.jsonc?|phpstan\.neon(?:\.dist)?|psalm\.xml)$/i.test(p));
  // One absent DAST step is one finding. The two follow-on controls describe HOW a
  // dynamic scan is configured, so with no dynamic scan there is nothing for them to
  // judge — they defer to the gate instead of repeating its finding twice more.
  const dastGate = gates.find(([key]) => key === "pulse_dynamic_security_gate")!;
  const hasDast = has(dastGate[2]);
  for (const [checkKey, label, pattern, passDetail, warnDetail] of gates) {
    if (!hasDast && (checkKey === "pulse_dynamic_security_auth" || checkKey === "pulse_dynamic_security_isolation")) {
      checks.push({
        category: CATEGORIES.CODE_QUALITY,
        checkKey,
        label,
        status: "SKIPPED",
        detail: "Not assessed: no dynamic security scan was found in CI, so there is no scan configuration to check. See \"Dynamic security baseline runs before release\" (pulse_dynamic_security_gate).",
      });
      continue;
    }
    const enabled = has(pattern) ||
      (checkKey === "pulse_browser_release_coverage" && criticalBrowserTestPath) ||
      // A checked-in analyzer config IS a reviewable static-analysis policy (discourse:
      // .rubocop.yml + eslint.config.mjs; supabase: apps/*/eslint.config.cjs). Path-based,
      // so it does not depend on which files the sampler happened to read. Formatter-only
      // configs (.prettierrc, tsconfig.json) do not count.
      (checkKey === "pulse_static_analysis_policy" && staticAnalysisConfigPath);
    checks.push(absence(ctx, {
      category: CATEGORIES.CODE_QUALITY,
      checkKey,
      label,
      status: enabled ? "PASS" : "WARN",
      detail: enabled
        ? passDetail
        : warnDetail,
    }));
  }

  return checks;
}

// ── Executable delivery and abuse safeguards ───────────────────────────────
function deliverySafetyChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const workflow = ctx.automation;
  if (workflow) {
    const unsafeCheckout = /\bpull_request_target\b/i.test(workflow) && /actions\/checkout[\s\S]{0,240}(?:github\.event\.pull_request\.head|ref\s*:)/i.test(workflow);
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_ci_untrusted_checkout", label: "Privileged CI does not check out contributor-controlled code", status: unsafeCheckout ? "FAIL" : "PASS", confidence: "HIGH", detail: unsafeCheckout ? "A privileged pull-request workflow checks out a contributor-controlled ref. Keep untrusted code in an unprivileged workflow." : "No unsafe privileged pull-request checkout pattern found." });
    const privilegedUntrusted = /\b(?:pull_request_target|workflow_run)\b/i.test(workflow) &&
      (/(?:permissions\s*:\s*(?:write-all|[\s\S]{0,100}\bwrite\b)|secrets\.|github\.event\.pull_request\.head)/i.test(workflow));
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_ci_untrusted_privilege", label: "Untrusted CI code cannot access write privileges or secrets", status: privilegedUntrusted ? "FAIL" : "PASS", confidence: "HIGH", detail: privilegedUntrusted ? "A workflow triggered by untrusted contribution activity can access write privileges, secrets, or contributor-controlled code. Split review and privileged deployment work into separate workflows." : "No unsafe untrusted-contribution privilege pattern found in scanned workflows." });
    const mutableAction = /\buses:\s*[^\s@]+@(?![a-f0-9]{40}\b)[^\s#]+/i.test(workflow);
    const immutableActions: Omit<PulseScanCheckInput, "confidence"> = { category: CATEGORIES.CODE_QUALITY, checkKey: "pulse_ci_immutable_actions", label: "CI actions are pinned to immutable revisions", status: mutableAction ? "WARN" : "PASS", detail: mutableAction ? "At least one CI action is referenced by a mutable tag. Pin release-critical actions to an immutable revision and review updates deliberately." : "Scanned CI action references are immutable." };
    // A mutable ref we SAW is a presence finding: sound at any sample coverage.
    checks.push(mutableAction ? { ...immutableActions, confidence: "HIGH" } : absence(ctx, immutableActions));
    const floatingImage = /\bimage:\s*[^\s#]+:latest\b/i.test(workflow);
    const immutableImages: Omit<PulseScanCheckInput, "confidence"> = { category: CATEGORIES.CODE_QUALITY, checkKey: "pulse_ci_immutable_images", label: "CI container images avoid floating latest tags", status: floatingImage ? "WARN" : "PASS", detail: floatingImage ? "A CI container image uses a floating latest tag, so the same workflow can execute different code over time." : "No floating latest container image found in scanned workflows." };
    // A floating tag we SAW is a presence finding: sound at any sample coverage.
    checks.push(floatingImage ? { ...immutableImages, confidence: "HIGH" } : absence(ctx, immutableImages));
    const remoteBootstrap = /\b(?:curl|wget)\b[^\n|]{0,200}\|\s*(?:ba)?sh\b/i.test(workflow);
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_ci_remote_shell", label: "CI does not pipe remote downloads into a shell", status: remoteBootstrap ? "FAIL" : "PASS", confidence: "HIGH", detail: remoteBootstrap ? "A workflow pipes a remote download directly into a shell. Fetch, checksum, review, and execute a pinned artifact instead." : "No remote-download-to-shell pattern found in scanned workflows." });
  }

  const docker = workflow;
  if (/\bFROM\b/i.test(docker)) {
    const root = /\bUSER\s+root\b/i.test(docker) || !/\bUSER\s+[^\s]+/i.test(docker);
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_container_nonroot", label: "Container runtime does not default to root", status: root ? "WARN" : "PASS", confidence: "HIGH", detail: root ? "Container configuration runs as root or declares no non-root user." : "Container configuration declares a non-root runtime user." });
    const secretLayer = /\b(?:ARG|ENV)\s+\w*(?:SECRET|TOKEN|PASSWORD|API_KEY)\w*=/i.test(docker);
    checks.push({ category: CATEGORIES.SECRETS_KEYS, checkKey: "pulse_container_secret_layer", label: "Container layers do not embed secrets", status: secretLayer ? "FAIL" : "PASS", confidence: "HIGH", detail: secretLayer ? "A container build argument or environment layer appears to embed a secret." : "No secret-like container layer declaration found." });
  }
  const checksSource = ctx.source;
  const addFail = (key: string, label: string, pattern: RegExp, detail: string) => { const sites = sitesMatching(ctx, pattern); if (sites.count) checks.push({ category: CATEGORIES.SECURITY, checkKey: key, label, status: "FAIL", confidence: "HIGH", detail, evidence: sites.where }); };
  addFail("pulse_public_storage_policy", "Storage policies do not expose public write access", /(?:storage|bucket)[\s\S]{0,120}(?:public\s*:\s*true|allow\s+(?:read|write)[\s\S]{0,60}\btrue\b)/i, "Source contains a public storage policy pattern.");
  // A user-SUPPLIED value (query string, form body, route param), not the request's own
  // path: djangoproject.com's `redirect(request.path[:-6])` trims "index/" off the current
  // URL and took a HIGH FAIL as an open redirect.
  addFail("pulse_open_redirect", "Redirect targets are allow-listed", /(?:redirect|location)\s*\(\s*(?:req\.(?:query|body|params)|request\.(?:GET|POST|args|form|values|query_params|data|params|query|body)\b|params\[)/i, "A redirect target appears to come directly from request input (a query, form or route parameter).");
  addFail("pulse_ssrf", "Server-side fetch targets are not user-controlled", /(?:fetch|axios\.(?:get|post)|request)\s*\(\s*(?:req\.(?:query|body|params)|request\.)/i, "A server-side request target appears to come directly from request input.");
  if (/\b(?:webhook|onWebhook)\b/i.test(checksSource)) checks.push(absence(ctx, { category: CATEGORIES.SECURITY, checkKey: "pulse_webhook_replay", label: "Webhooks verify signatures and replay windows", status: /\b(?:signature|hmac|timestamp|replay)\b/i.test(checksSource) ? "PASS" : "WARN", detail: "Webhook handling needs signature and replay-window verification evidence." }));
  // `tools:` alone is any config object; a tool CALL is the trigger. The label names
  // four controls, so all four must be evidenced to pass — one stray `timeout: 5000`
  // in a fetch config used to pass it outright.
  if (/\b(?:toolCalls?|tool_calls|function_call)\b/i.test(checksSource)) {
    const controls: Array<[string, RegExp]> = [
      ["approval", /\b(?:approval|approve|confirm(?:ation)?|humanReview|needsApproval)\b/i],
      ["budget", /\b(?:budget|maxTokens|max_tokens|maxOutputTokens|maxSteps|stopWhen|max_iterations)\b/i],
      ["timeout", /\b(?:timeout|AbortController|abortSignal)\b/i],
      ["audit", /\b(?:audit\w*|decisionLog|toolLog)\b/i],
    ];
    const missing = controls.filter(([, re]) => !re.test(checksSource)).map(([name]) => name);
    checks.push(aiAbsence(ctx, { category: CATEGORIES.AI_READINESS, checkKey: "pulse_ai_tool_controls", label: "AI tool calls require approval, budget, timeout, and audit controls", status: missing.length === 0 ? "PASS" : "WARN", detail: missing.length === 0 ? "Approval, budget, timeout and audit evidence were all found around AI tool-call handling." : `AI tool-call handling shows no evidence of: ${missing.join(", ")}. Consequential tools should need approval, run within a step/token budget and a timeout, and leave an audit record.` }));
  }

  const scripts = ctx.pkg?.scripts ?? {};
  const riskyLifecycle = Object.entries(scripts).some(([name, command]) => /^(?:preinstall|install|postinstall|prepare)$/i.test(name) && /\b(?:curl|wget|powershell|bash|sh|node\s+-e)\b/i.test(command));
  if (Object.keys(scripts).length > 0) checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_install_lifecycle_risk", label: "Install lifecycle hooks avoid remote or inline execution", status: riskyLifecycle ? "FAIL" : "PASS", confidence: "HIGH", detail: riskyLifecycle ? "An install lifecycle hook performs remote or inline execution. Treat it as release code: pin inputs, review it, or remove it." : "No risky install lifecycle execution found in package scripts." });

  const urlSecret = sitesMatching(ctx, /https?:\/\/[^\s"'`]+[?&](?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret)=/i);
  if (urlSecret.count > 0) checks.push({ category: CATEGORIES.SECRETS_KEYS, checkKey: "pulse_url_secret", label: "Credentials are not placed in URLs", status: "FAIL", confidence: "HIGH", detail: "A credential-like value appears in a URL query string. URLs leak through browser history, proxies, server logs, and referrers; use an authorization header or request body.", evidence: urlSecret.where });

  const hasServer = /\b(?:express\s*\(|fastify\s*\(|createServer\s*\(|app\.(?:post|put|patch)|router\.(?:post|put|patch))\b/i.test(ctx.source);
  const bodyLimit = /\b(?:express\.json|bodyParser\.(?:json|urlencoded)|json)\s*\(\s*\{[^}]*\blimit\s*:/i.test(ctx.source);
  // body-parser (and express.json/urlencoded/raw/text, which wrap it) caps every body at 100kb when no limit is passed.
  const defaultBodyLimit = !bodyLimit && /\b(?:express|bodyParser)\.(?:json|urlencoded|raw|text)\s*\(/.test(ctx.source);
  if (hasServer) checks.push(absence(ctx, { category: CATEGORIES.API_QUALITY, checkKey: "pulse_request_body_limit", label: "Server request bodies have explicit size limits", status: bodyLimit || defaultBodyLimit ? "PASS" : "WARN", detail: bodyLimit ? "An explicit request-body limit is configured in scanned server source." : defaultBodyLimit ? "Request bodies are parsed with body-parser/Express defaults, which cap each body at 100kb." : "No explicit request-body size limit found in scanned server source. Bound request parsing before allocating attacker-controlled payloads." }));
  const hasUpload = /\b(?:multer|formData|fileUpload|single\s*\(|array\s*\()/.test(ctx.source);
  const uploadLimit = /\b(?:fileSize|limits\s*:|content-length|maxFileSize)\b/i.test(ctx.source);
  if (hasUpload) checks.push(absence(ctx, { category: CATEGORIES.SECURITY, checkKey: "pulse_upload_limit", label: "File uploads enforce size limits", status: uploadLimit ? "PASS" : "WARN", detail: uploadLimit ? "Upload size-limit evidence found in scanned source." : "Upload handling was found without an explicit size limit. Enforce byte limits before storage and decompression." }));
  return checks;
}

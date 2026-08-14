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
import { isVendoredPath, stripCStyleComments } from "./native-mobile";
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

function buildContext(snapshot: RepoSnapshot): WebContext {
  const sourcePaths = snapshot.paths.filter((p) => SOURCE_RE.test(p) && !isVendoredPath(p));
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
    else if (SOURCE_RE.test(path) && !isVendoredPath(path)) files.set(path, text);
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
    coverage: sourcePaths.length === 0 ? 0 : Math.min(1, files.size / sourcePaths.length),
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

function aiRepositoryReadinessChecks(ctx: WebContext): PulseScanCheckInput[] {
  const source = ctx.source;
  if (!/\b(?:openai|anthropic|chat\.completions|generateContent|useChat|languageModel)\b/i.test(source)) return [];
  const checks: PulseScanCheckInput[] = [];
  const signal = (key: string, label: string, pattern: RegExp, detail: string) => checks.push(absence(ctx, { category: CATEGORIES.AI_READINESS, checkKey: key, label, status: pattern.test(source) ? "PASS" : "WARN", detail }));
  signal("pulse_ai_retry_policy", "AI requests use bounded retry policy", /\b(?:retry|backoff|maxRetries)\b/i, "AI request paths need bounded retries with backoff evidence.");
  signal("pulse_ai_failure_fallback", "AI failures have a user-safe fallback", /\b(?:fallback|try again|graceful|provider unavailable)\b/i, "AI request paths need an explicit user-safe fallback.");
  signal("pulse_ai_stream_cancel", "Streaming AI responses can be cancelled", /\b(?:AbortController|abort\(|cancel(?:led)?\b)\b/i, "Streaming AI paths need cancellation evidence.");
  signal("pulse_ai_evaluation_fixture", "AI changes have versioned evaluation fixtures", /\b(?:evals?|golden(?:set)?|benchmark|testCases)\b/i, "AI code needs versioned evaluation fixtures or benchmark evidence.");
  signal("pulse_ai_monitoring", "AI requests emit operational telemetry", /\b(?:trace|span|metrics|observability|telemetry)\b/i, "AI request paths need trace, metric, or telemetry evidence.");
  signal("pulse_ai_cost_budget", "AI requests enforce cost or token budgets", /\b(?:maxTokens|tokenBudget|costBudget|usageLimit)\b/i, "AI request paths need token or cost-budget evidence.");
  signal("pulse_ai_feedback_capture", "AI output feedback is captured for review", /\b(?:feedback|thumbs(?:Up|Down)?|rating|regenerate)\b/i, "AI output paths need feedback-capture evidence.");
  signal("pulse_ai_model_version", "AI model and prompt versions are recorded", /\b(?:modelVersion|promptVersion|model:\s*["'`])\b/i, "AI request paths need model or prompt version evidence.");
  return checks;
}

function aiRepositorySafetyChecks(ctx: WebContext): PulseScanCheckInput[] {
  const source = ctx.source;
  const ai = /\b(?:openai|anthropic|chat\.completions|generateContent|useChat|languageModel|toolCall|function_call|vectorStore|embedding)\b/i.test(source);
  if (!ai) return [];
  const checks: PulseScanCheckInput[] = [];
  const add = (key: string, label: string, pattern: RegExp, detail: string) => {
    const hits = sitesMatching(ctx, pattern);
    if (hits.count) checks.push({ category: CATEGORIES.AI_SAFETY, checkKey: key, label, status: "FAIL", confidence: "HIGH", detail, evidence: hits.where });
  };
  add("pulse_ai_client_secret", "AI provider credentials stay server-side", /(?:sk-[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{20,})/, "An AI provider credential pattern appears in application source.");
  add("pulse_ai_client_prompt", "Long system instructions stay server-side", /(?:system|developer)\s*(?:=|:)\s*["'`][^"'`]{80,}/i, "A long system/developer instruction appears in client-readable source.");
  add("pulse_ai_unsafe_tool", "AI tool calls validate arguments before execution", /(?:toolCall|function_call)[\s\S]{0,160}(?:exec\(|spawn\(|fetch\(|redirect\()/i, "An AI tool-call path reaches an execution or network primitive without visible validation.");
  add("pulse_ai_unscoped_retrieval", "AI retrieval applies user or tenant scope", /(?:vectorStore|similaritySearch|embedding)[\s\S]{0,180}(?!tenant|userId|organizationId)/i, "Retrieval code lacks visible user or tenant scoping near the query.");
  if (/\b(?:toolCall|function_call)\b/i.test(source)) checks.push(absence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_tool_confirmation", label: "High-impact AI tool calls require confirmation", status: /\b(?:confirm|approval|humanReview)\b/i.test(source) ? "PASS" : "WARN", detail: "Tool-call code needs explicit confirmation or approval evidence for consequential actions." }));
  checks.push(absence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_output_schema", label: "AI outputs are schema-validated before use", status: /\b(?:zod|safeParse|schema\.parse|json_schema|structuredOutput)\b/i.test(source) ? "PASS" : "WARN", detail: "AI code needs schema-validation evidence before output is rendered, persisted, or executed." }));
  checks.push(absence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_budget_timeout", label: "AI requests have budget and timeout limits", status: /\b(?:maxTokens|tokenBudget|timeout|AbortController|rateLimit)\b/i.test(source) ? "PASS" : "WARN", detail: "AI request paths need token-budget, timeout, or rate-limit evidence." }));
  checks.push(absence(ctx, { category: CATEGORIES.AI_SAFETY, checkKey: "pulse_ai_audit_log", label: "AI tool decisions create auditable records", status: /\b(?:auditLog|audit\.log|toolAudit|decisionLog)\b/i.test(source) ? "PASS" : "WARN", detail: "AI tool or decision paths need privacy-safe audit-record evidence." }));
  return checks;
}

// ── Injection & unsafe code ─────────────────────────────────────────────────
function injectionChecks(ctx: WebContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // The single most common finding in AI-built React apps. Deliberately NOT a
  // FAIL on its own: rendering trusted, sanitised markup this way is legitimate,
  // and a scanner that fails every use is one people learn to ignore.
  const dsi = sitesMatching(ctx, /dangerouslySetInnerHTML/);
  const rawInner = sitesMatching(ctx, /\.innerHTML\s*=|insertAdjacentHTML\s*\(/);
  if (dsi.count > 0 || rawInner.count > 0) {
    const sanitises = /DOMPurify|sanitize-html|xss\b|sanitizeHtml/i.test(
      ctx.source + JSON.stringify(ctx.pkg?.dependencies ?? {}),
    );
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_raw_html_injection",
      label: "Raw HTML is sanitised before rendering",
      status: sanitises ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail: sanitises
        ? `Raw HTML rendering found in ${dsi.count + rawInner.count} file(s), and a sanitiser (DOMPurify / ` +
          `sanitize-html) is present in this project. Confirm EVERY site that can receive user or remote content ` +
          `passes through it — a sanitiser in the dependency list is not the same as a sanitiser on this code path.`
        : `\`dangerouslySetInnerHTML\` or a raw \`innerHTML\` assignment appears in ${dsi.count + rawInner.count} ` +
          `file(s), with no HTML sanitiser anywhere in the project. If any of that markup can contain something a ` +
          `user typed — a comment, a profile field, a name, anything round-tripped through your API — it is a ` +
          `cross-site-scripting hole, and the attacker's script runs with your users' session. Render text as text, ` +
          `and pass unavoidable HTML through DOMPurify.`,
      evidence: [dsi.where, rawInner.where].filter(Boolean).join(" | ").slice(0, 200) || undefined,
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
  sqlPatterns.push([
    new RegExp(`\`${tpl}{0,300}?${sqlShape(tpl)}${tpl}{0,300}?${valuePoint}\\$\\{`, "i"),
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
  const evalSites = sitesMatching(ctx, /\beval\s*\(|new\s+Function\s*\(|\bexec\s*\(\s*["'`]/);
  if (evalSites.count > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "web_dynamic_code_execution",
      label: "No dynamic code execution",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `\`eval\`, \`new Function\` or \`exec\` on a string literal appears in ${evalSites.count} file(s). If any part ` +
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
    const envCommitted = ctx.paths.some((p) => /(^|\/)\.env($|\.[a-z]+$)/i.test(p) && !/\.example$|\.sample$|\.template$/i.test(p));
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "web_gitignore_covers_env",
      label: ".gitignore excludes environment files",
      status: envCommitted ? "FAIL" : coversEnv ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: envCommitted
        ? `A \`.env\` file is committed to this repository. Everything in it should be treated as public — git history ` +
          `preserves it even after deletion, and forks and clones already have it. Rotate every credential it ` +
          `contains at the provider, then add \`.env\` to .gitignore and remove it with \`git rm --cached\`.`
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
  const debugOn = sitesMatching(ctx, /DEBUG\s*=\s*True|debug\s*=\s*True|app\.run\([^)]*debug\s*=\s*True/);
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
          `(${loose.slice(0, 3).map(([k]) => k).join(", ")}). Two builds of the same commit can then produce ` +
          `different applications, and a compromised release is pulled in with no diff to review. A raw URL is worse ` +
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
    ["pulse_static_analysis_gate", "Static analysis runs in CI", /\b(?:static[-_ ]analysis|sast|source[-_ ]analysis)\b/i, "Static analysis is wired into the delivery workflow.", "No CI evidence of static analysis. Pulse requires source-pattern analysis before merge."],
    ["pulse_static_analysis_policy", "Static-analysis rules are versioned", /\b(?:static[-_ ]analysis|sast)\b[\s\S]{0,240}\b(?:rules|policy|config(?:uration)?)\b|\b(?:rules|policy|config(?:uration)?)\b[\s\S]{0,240}\b(?:static[-_ ]analysis|sast)\b/i, "A checked-in static-analysis policy is present.", "No checked-in static-analysis policy evidence. Keep reviewable rules with the repository."],
    ["pulse_static_analysis_blocking", "Static-analysis findings block unsafe changes", /\b(?:static[-_ ]analysis|sast)\b[\s\S]{0,240}\b(?:fail|block|threshold|severity|critical|high)\b/i, "The static-analysis workflow includes blocking criteria.", "No evidence that static-analysis findings block a merge or release."],
    ["pulse_secret_scan_gate", "Secret scanning runs in CI", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b/i, "A secret-scanning workflow is present.", "No CI evidence of secret scanning. Pulse requires credential detection before merge."],
    ["pulse_secret_history_scope", "Secret scanning covers repository history", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b[\s\S]{0,240}\b(?:history|full[-_ ]repo|all[-_ ]commits|pull[-_ ]request)\b/i, "The secret scan includes repository-history or pull-request coverage.", "No evidence that secret scanning covers history or pull requests."],
    ["pulse_secret_remediation", "Secret findings have a remediation path", /\b(?:secret[-_ ]scan|secret[-_ ]detection|credential[-_ ]scan)\b[\s\S]{0,240}\b(?:revoke|rotate|redact|remediate|incident)\b/i, "The repository documents how a secret finding is contained.", "No evidence of a documented revoke, rotation, or remediation path for secret findings."],
    ["pulse_supply_chain_gate", "Supply-chain risk scanning runs in CI", /\b(?:supply[-_ ]chain|dependency[-_ ]scan|iac[-_ ]scan|artifact[-_ ]scan)\b/i, "A supply-chain risk scan is wired into delivery.", "No CI evidence of dependency, infrastructure, or artifact risk scanning."],
    ["pulse_supply_chain_inventory", "A release inventory is generated", /\b(?:sbom|software[-_ ]bill[-_ ]of[-_ ]materials|release[-_ ]inventory)\b/i, "Release inventory generation is configured.", "No evidence that a release inventory is generated for shipped artifacts."],
    ["pulse_supply_chain_blocking", "Supply-chain risk has blocking thresholds", /\b(?:supply[-_ ]chain|dependency[-_ ]scan|iac[-_ ]scan|artifact[-_ ]scan)\b[\s\S]{0,240}\b(?:fail|block|threshold|severity|critical|high)\b/i, "Supply-chain workflow includes blocking criteria.", "No evidence that high-risk supply-chain findings block a release."],
    ["pulse_code_flow_gate", "Code-flow analysis runs in CI", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b/i, "A code-flow analysis workflow is present.", "No CI evidence of code-flow analysis for paths that simple pattern matching cannot judge."],
    ["pulse_code_flow_sources", "Code-flow analysis models untrusted inputs", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b[\s\S]{0,240}\b(?:source|untrusted|input|taint)\b/i, "The code-flow policy includes untrusted-input modelling.", "No evidence that code-flow analysis models untrusted inputs."],
    ["pulse_code_flow_sinks", "Code-flow analysis protects sensitive operations", /\b(?:code[-_ ]flow|data[-_ ]flow|interprocedural|query[-_ ]analysis)\b[\s\S]{0,240}\b(?:sink|database|shell|html|network)\b/i, "The code-flow policy includes sensitive-operation coverage.", "No evidence that code-flow analysis covers sensitive operations."],
    ["pulse_browser_journeys", "Browser journeys run before release", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b/i, "Browser journey tests are wired into delivery.", "No CI evidence that critical user journeys run in a real browser."],
    ["pulse_browser_failure_evidence", "Browser failures retain diagnostic evidence", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b[\s\S]{0,240}\b(?:trace|screenshot|video|network[-_ ]log)\b/i, "Browser failures retain reproducible diagnostic evidence.", "No evidence that browser failures retain traces, screenshots, video, or network logs."],
    ["pulse_browser_release_coverage", "Browser tests cover release-critical paths", /\b(?:browser[-_ ]test|browser[-_ ]journey|end[-_ ]to[-_ ]end|e2e)\b[\s\S]{0,240}\b(?:login|checkout|payment|signup|onboarding|critical)\b/i, "Browser-test configuration names release-critical paths.", "No evidence that browser tests cover login, onboarding, payments, or other critical paths."],
    ["pulse_accessibility_assertions", "Accessibility assertions run with UI tests", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|toHaveNoViolations)\b/i, "Automated accessibility assertions run with UI tests.", "No CI evidence of automated accessibility assertions against rendered UI."],
    ["pulse_accessibility_keyboard", "UI tests verify keyboard operation", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|keyboard[-_ ]navigation|focus[-_ ]order)\b/i, "UI-test evidence includes keyboard or focus validation.", "No evidence that UI tests verify keyboard navigation or focus order."],
    ["pulse_accessibility_semantics", "UI tests verify accessible semantics", /\b(?:accessibility[-_ ]assertion|accessibility[-_ ]test|a11y[-_ ]test|accessible[-_ ]name|role[-_ ]assertion|contrast[-_ ]check)\b/i, "UI-test evidence includes semantic or contrast validation.", "No evidence that UI tests verify accessible names, roles, or contrast."],
    ["pulse_dynamic_security_gate", "Dynamic security baseline runs before release", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b/i, "A dynamic web or API security baseline is wired into delivery.", "No CI evidence of dynamic web or API security testing before release."],
    ["pulse_dynamic_security_auth", "Dynamic security checks authenticated paths", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b[\s\S]{0,240}\b(?:auth(?:enticated)?|session|token|role)\b/i, "Dynamic security configuration covers authenticated behaviour.", "No evidence that dynamic security checks cover authenticated sessions or roles."],
    ["pulse_dynamic_security_isolation", "Dynamic security tests run against a safe target", /\b(?:dynamic[-_ ]security|dynamic[-_ ]scan|dast|web[-_ ]api[-_ ]baseline)\b[\s\S]{0,240}\b(?:staging|preview|sandbox|test[-_ ]environment)\b/i, "Dynamic security tests target an isolated environment.", "No evidence that dynamic security tests run against a safe staging, preview, sandbox, or test environment."],
  ];

  for (const [checkKey, label, pattern, passDetail, warnDetail] of gates) {
    const enabled = has(pattern);
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
    checks.push(absence(ctx, { category: CATEGORIES.CODE_QUALITY, checkKey: "pulse_ci_immutable_actions", label: "CI actions are pinned to immutable revisions", status: mutableAction ? "WARN" : "PASS", detail: mutableAction ? "At least one CI action is referenced by a mutable tag. Pin release-critical actions to an immutable revision and review updates deliberately." : "Scanned CI action references are immutable." }));
    const floatingImage = /\bimage:\s*[^\s#]+:latest\b/i.test(workflow);
    checks.push(absence(ctx, { category: CATEGORIES.CODE_QUALITY, checkKey: "pulse_ci_immutable_images", label: "CI container images avoid floating latest tags", status: floatingImage ? "WARN" : "PASS", detail: floatingImage ? "A CI container image uses a floating latest tag, so the same workflow can execute different code over time." : "No floating latest container image found in scanned workflows." }));
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
  addFail("pulse_open_redirect", "Redirect targets are allow-listed", /(?:redirect|location)\s*\(\s*(?:req\.(?:query|body|params)|request\.)/i, "A redirect target appears to come directly from request input.");
  addFail("pulse_ssrf", "Server-side fetch targets are not user-controlled", /(?:fetch|axios\.(?:get|post)|request)\s*\(\s*(?:req\.(?:query|body|params)|request\.)/i, "A server-side request target appears to come directly from request input.");
  if (/\b(?:webhook|onWebhook)\b/i.test(checksSource)) checks.push(absence(ctx, { category: CATEGORIES.SECURITY, checkKey: "pulse_webhook_replay", label: "Webhooks verify signatures and replay windows", status: /\b(?:signature|hmac|timestamp|replay)\b/i.test(checksSource) ? "PASS" : "WARN", detail: "Webhook handling needs signature and replay-window verification evidence." }));
  if (/\b(?:toolCall|tools\s*:|function_call)\b/i.test(checksSource)) checks.push(absence(ctx, { category: CATEGORIES.AI_READINESS, checkKey: "pulse_ai_tool_controls", label: "AI tool calls require approval, budget, timeout, and audit controls", status: /\b(?:approval|confirm|budget|timeout|audit)\b/i.test(checksSource) ? "PASS" : "WARN", detail: "AI tool-call handling needs approval, budget, timeout, and audit evidence." }));

  const scripts = ctx.pkg?.scripts ?? {};
  const riskyLifecycle = Object.entries(scripts).some(([name, command]) => /^(?:preinstall|install|postinstall|prepare)$/i.test(name) && /\b(?:curl|wget|powershell|bash|sh|node\s+-e)\b/i.test(command));
  if (Object.keys(scripts).length > 0) checks.push({ category: CATEGORIES.SECURITY, checkKey: "pulse_install_lifecycle_risk", label: "Install lifecycle hooks avoid remote or inline execution", status: riskyLifecycle ? "FAIL" : "PASS", confidence: "HIGH", detail: riskyLifecycle ? "An install lifecycle hook performs remote or inline execution. Treat it as release code: pin inputs, review it, or remove it." : "No risky install lifecycle execution found in package scripts." });

  const urlSecret = sitesMatching(ctx, /https?:\/\/[^\s"'`]+[?&](?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret)=/i);
  if (urlSecret.count > 0) checks.push({ category: CATEGORIES.SECRETS_KEYS, checkKey: "pulse_url_secret", label: "Credentials are not placed in URLs", status: "FAIL", confidence: "HIGH", detail: "A credential-like value appears in a URL query string. URLs leak through browser history, proxies, server logs, and referrers; use an authorization header or request body.", evidence: urlSecret.where });

  const hasServer = /\b(?:express\s*\(|fastify\s*\(|createServer\s*\(|app\.(?:post|put|patch)|router\.(?:post|put|patch))\b/i.test(ctx.source);
  const bodyLimit = /\b(?:express\.json|bodyParser\.(?:json|urlencoded)|json)\s*\(\s*\{[^}]*\blimit\s*:/i.test(ctx.source);
  if (hasServer) checks.push(absence(ctx, { category: CATEGORIES.API_QUALITY, checkKey: "pulse_request_body_limit", label: "Server request bodies have explicit size limits", status: bodyLimit ? "PASS" : "WARN", detail: bodyLimit ? "An explicit request-body limit is configured in scanned server source." : "No explicit request-body size limit found in scanned server source. Bound request parsing before allocating attacker-controlled payloads." }));
  const hasUpload = /\b(?:multer|formData|fileUpload|single\s*\(|array\s*\()/.test(ctx.source);
  const uploadLimit = /\b(?:fileSize|limits\s*:|content-length|maxFileSize)\b/i.test(ctx.source);
  if (hasUpload) checks.push(absence(ctx, { category: CATEGORIES.SECURITY, checkKey: "pulse_upload_limit", label: "File uploads enforce size limits", status: uploadLimit ? "PASS" : "WARN", detail: uploadLimit ? "Upload size-limit evidence found in scanned source." : "Upload handling was found without an explicit size limit. Enforce byte limits before storage and decompression." }));
  return checks;
}

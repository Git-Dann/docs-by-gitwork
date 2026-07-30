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
  let sql = "";
  let pkgText: string | null = null;

  for (const [path, text] of snapshot.files) {
    if (/(^|\/)\.gitignore$/i.test(path)) gitignore += "\n" + text;
    else if (/^README(\.md|\.markdown|\.rst|\.txt)?$/i.test(path) || /\.(sh|bash)$/i.test(path)) {
      docsAndScripts += "\n" + text;
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
  if (ctx.files.size === 0 && ctx.gitignore === "" && ctx.docsAndScripts === "") return [];

  return [
    ...injectionChecks(ctx),
    ...credentialChecks(ctx),
    ...frameworkDefaultChecks(ctx),
    ...transportChecks(ctx),
    ...supplyChainChecks(ctx),
  ];
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

  // SQL assembled by string building, across the four idioms that produce it.
  const sqlKeyword = "(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|VALUES)";
  const sqlPatterns: Array<[RegExp, string]> = [
    [new RegExp(`f["'][^"']*${sqlKeyword}[^"']*\\{`, "i"), "Python f-string"],
    [new RegExp(`["'][^"']*${sqlKeyword}[^"']*["']\\s*\\.\\s*format\\s*\\(`, "i"), "str.format()"],
    [new RegExp(`\`[^\`]*${sqlKeyword}[^\`]*\\$\\{`, "i"), "template literal"],
    [new RegExp(`["'][^"']*${sqlKeyword}[^"']*["']\\s*\\+\\s*\\w`, "i"), "string concatenation"],
    [new RegExp(`["'][^"']*${sqlKeyword}[^"']*["']\\s*%\\s*\\(?\\w`, "i"), "%-formatting"],
  ];
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
  const shellSites = sitesMatching(
    ctx,
    /shell\s*=\s*True|child_process[\s\S]{0,60}\bexec\s*\(\s*[`'"][^`'"]*\$\{|\bexec\s*\(\s*`[^`]*\$\{|os\.system\s*\(/,
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

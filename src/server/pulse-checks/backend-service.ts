// ─────────────────────────────────────────────────────────────────────────────
// BACKEND SERVICE FAMILY — framework configuration, read as values not presence.
//
// WHY THIS EXISTS. web-repo-source.ts matches PATTERNS in application code
// (concatenated SQL, unsanitised HTML). That is the right tool for code and the
// wrong one for configuration: whether a Django service is safe to expose is
// decided by about a dozen named settings whose VALUES are unambiguous, and
// guessing at them from source patterns produces noise in both directions.
//
// So this family reads named config files and grades named settings. Django's own
// `manage.py check --deploy`, the Rails production environment template, Laravel's
// deployment guide and Spring Boot's actuator defaults are all published checklists
// — this is those, applied automatically. Citations in
// docs/platform-check-sources.md.
//
// Every check SKIPs when the framework it grades is not present, so a Node service
// is never marked down for lacking a Django setting. A repo with none of these
// frameworks gets the whole family as SKIPPED.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, sampleCoverage } from "./native-mobile";

export type BackendFramework = "django" | "rails" | "laravel" | "spring" | "express" | "next" | null;

interface Ctx {
  frameworks: Set<string>;
  pySettings: string;
  /** Django settings modules read, by path (settings.py, settings/production.py …). */
  pySettingsFiles: [string, string][];
  /** The pinned Django major version, when a requirements file states one. */
  djangoMajor: number | null;
  railsProd: string;
  laravelConfig: string;
  springProps: string;
  nodeSource: string;
  /** Python source outside settings modules (FastAPI / Flask app setup). */
  pySource: string;
  packageJson: string;
  envExample: string;
  allConfig: string;
}

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const py: string[] = [];
  const rails: string[] = [];
  const laravel: string[] = [];
  const spring: string[] = [];
  const node: string[] = [];
  let packageJson = "";
  const envExample: string[] = [];
  const pySrc: string[] = [];
  const pySettingsFiles: [string, string][] = [];
  let djangoMajor: number | null = null;

  for (const [path, text] of snapshot.files) {
    if (/(?:^|\/)(?:\w+_)?settings(?:_\w+)?\.py$|(?:^|\/)settings\/[\w-]+\.py$/i.test(path) && !isVendoredPath(path)) {
      pySettingsFiles.push([path, text]);
    }
    if (/(?:^|\/)(?:requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.(?:py|cfg))$/i.test(path)) {
      const pin = /\bdjango\s*(?:==|~=|===)\s*["']?(\d+)\./i.exec(text) ?? /["']?django["']?\s*=\s*["'](?:==|~=|\^)?(\d+)\./i.exec(text);
      if (pin) djangoMajor = Number(pin[1]);
    }
    if (/settings(_?\w*)?\.py$/i.test(path)) py.push(text);
    else if (/config\/environments\/production\.rb$/i.test(path)) rails.push(text);
    else if (/config\/(application|storage|database)\.rb$/i.test(path)) rails.push(text);
    else if (/composer\.json$/i.test(path) || /(^|\/)config\/app\.php$/i.test(path)) laravel.push(text);
    else if (/application(-\w+)?\.(properties|ya?ml)$/i.test(path)) spring.push(text);
    else if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
    else if (/\.env\.example$/i.test(path)) envExample.push(text);
    if (/\.(ts|js|mjs|cjs)$/i.test(path)) node.push(text);
    if (/\.py$/i.test(path) && !isVendoredPath(path)) pySrc.push(text);
  }

  const frameworks = new Set<string>();
  const paths = snapshot.paths.join("\n");
  if (py.length > 0 || /manage\.py/.test(paths)) frameworks.add("django");
  if (rails.length > 0 || /(^|\n)Gemfile/.test(paths)) frameworks.add("rails");
  if (/composer\.json/.test(paths) || /artisan/.test(paths)) frameworks.add("laravel");
  if (spring.length > 0 || /pom\.xml/.test(paths)) frameworks.add("spring");
  if (/express|fastify|@nestjs/i.test(packageJson)) frameworks.add("express");
  if (/"next":/.test(packageJson)) frameworks.add("next");

  return {
    frameworks,
    // A project whose settings are split into a package (settings/base.py,
    // settings/production.py) has no settings.py; read the package instead of skipping.
    pySettings: py.length > 0 ? py.join("\n") : pySettingsFiles.map(([, t]) => t).join("\n"),
    pySettingsFiles,
    djangoMajor,
    railsProd: rails.join("\n"),
    laravelConfig: laravel.join("\n"),
    springProps: spring.join("\n"),
    nodeSource: node.join("\n"),
    pySource: pySrc.join("\n"),
    packageJson,
    envExample: envExample.join("\n"),
    allConfig: [...py, ...rails, ...laravel, ...spring].join("\n"),
  };
}

const CATALOGUE: [string, string][] = [
  ["svc_django_debug", "Django DEBUG is not enabled in the committed settings"],
  ["svc_django_secret_key", "Django SECRET_KEY is not hardcoded"],
  ["svc_django_allowed_hosts", "Django ALLOWED_HOSTS is not a wildcard"],
  ["svc_django_ssl_redirect", "Django redirects HTTP to HTTPS"],
  ["svc_django_hsts", "Django sets an HSTS max-age"],
  ["svc_django_secure_cookies", "Django session and CSRF cookies are HTTPS-only"],
  ["svc_django_content_type_nosniff", "Django sends X-Content-Type-Options"],
  ["svc_rails_force_ssl", "Rails forces SSL in production"],
  ["svc_rails_secret_committed", "Rails credentials are not committed in plaintext"],
  ["svc_rails_eager_load", "Rails eager-loads code in production"],
  ["svc_laravel_debug", "Laravel APP_DEBUG is not enabled"],
  ["svc_laravel_app_key", "Laravel APP_KEY is not a committed literal"],
  ["svc_spring_actuator_exposure", "Spring actuator endpoints are not fully exposed"],
  ["svc_spring_h2_console", "The Spring H2 console is not enabled"],
  ["svc_express_helmet", "Express sets security headers"],
  ["svc_express_body_limit", "The request body size is capped"],
  ["svc_express_rate_limit", "The service applies rate limiting"],
  ["svc_express_trust_proxy", "Proxy trust is configured explicitly"],
  ["svc_cors_wildcard", "CORS does not combine a wildcard origin with credentials"],
  ["svc_session_cookie_flags", "Session cookies set HttpOnly, Secure and SameSite"],
  ["svc_graceful_shutdown", "The service shuts down gracefully"],
  ["svc_health_endpoint", "The service exposes a health endpoint"],
  ["svc_structured_logging", "Logs are structured rather than free text"],
  ["svc_request_id", "Requests carry a correlation id"],
  ["svc_db_connection_pool", "Database connections are pooled"],
  ["svc_db_migrations_versioned", "Schema changes are versioned migrations"],
  ["svc_env_example_no_secrets", "The example environment file carries no real secrets"],
  ["svc_dependency_lockfile", "A dependency lockfile is committed"],
  ["svc_error_tracking", "The service reports errors to a tracker"],
  ["svc_stack_trace_leak", "Stack traces are not returned to clients"],
];

export const BACKEND_SERVICE_KEYS: string[] = CATALOGUE.map(([k]) => k);

/**
 * Read a Python settings assignment. Returns the literal text, or null when the
 * setting is absent or is read from the environment (which is correct, and must
 * never be graded as if the literal were the insecure default).
 */
export function pySetting(source: string, name: string): string | null {
  const m = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m").exec(source);
  if (!m) return null;
  const value = m[1].trim().replace(/\s*#.*$/, "");
  if (/os\.(environ|getenv)|env\(|config\(|decouple/i.test(value)) return null;
  return value;
}

/** The last top-level `NAME = value` in a Python file, comment stripped, or null if absent. */
export function pyAssignment(source: string, name: string): string | null {
  const all = pyAssignments(source, name, false);
  return all.length > 0 ? all[all.length - 1] : null;
}

/** Every `NAME = value` in a Python file, top-level only or at any indent (inside an if/else). */
export function pyAssignments(source: string, name: string, anyIndent: boolean): string[] {
  // A type annotation is allowed: PokeAPI writes `DEBUG: bool = False`.
  const re = new RegExp(`^${anyIndent ? "[ \\t]*" : ""}${name}(?:\\s*:\\s*[\\w.[\\], ]+?)?\\s*=(?!=)\\s*(.+)$`, "gm");
  return [...source.matchAll(re)].map((m) => m[1].replace(/\s+#.*$/, "").trim());
}

/**
 * The fallback a settings value takes when its environment variable is unset:
 * `os.environ.get("X", "True")`, `os.getenv("X", 1)`, `env("X", default=True)`,
 * `config("X", default=True, cast=bool)`. `readsEnv` is false for a plain literal;
 * `fallback` is null when there is no default (unset means None, or a KeyError).
 */
export function pyEnvFallback(value: string): { readsEnv: boolean; fallback: string | null } {
  if (!/os\.(?:environ|getenv)|\benv(?:\.\w+)?\(|\bconfig\(|decouple|getenv\(/i.test(value)) {
    return { readsEnv: false, fallback: null };
  }
  const keyword = /\bdefault\s*=\s*([^,)]+)/.exec(value);
  if (keyword) return { readsEnv: true, fallback: keyword[1].trim() };
  const positional = /(?:os\.environ\.get|os\.getenv|getenv|\benv(?:\.\w+)?|\bconfig)\(\s*["'][^"']+["']\s*,\s*([^,)]+)/.exec(value);
  return { readsEnv: true, fallback: positional ? positional[1].trim() : null };
}

const unquote = (v: string) => v.replace(/^[rbfu]?(["'])([\s\S]*)\1$/i, "$2");
/** A whole Python string literal, not an expression that starts with one (`"".join(...)`). */
const isStringLiteral = (v: string) => /^[rbfu]?(?:"[^"\n]*"|'[^'\n]*')$/i.test(v);

/**
 * Is DEBUG on when its environment variable is unset? "on" / "off" / "unknown".
 * Python semantics, applied to the committed fallback: `os.environ.get("DEBUG",
 * "True") == "True"` is on, and so is a bare `os.environ.get("DEBUG", "False")`,
 * because the string "False" is truthy and Django reads DEBUG with `if settings.DEBUG`.
 */
export function pyDebugFallbackOn(value: string): "on" | "off" | "unknown" {
  const { fallback } = pyEnvFallback(value);
  if (fallback === null || /^None$/.test(fallback)) return "off";
  const lowered = /\.lower\(\)/.test(value);
  const raw = unquote(fallback);
  const d = lowered ? raw.toLowerCase() : raw;
  const quoted = /^[rbfu]?["']/i.test(fallback);
  const eq = /(==|!=)\s*["']([^"']*)["']/.exec(value);
  if (eq) return (d === eq[2]) === (eq[1] === "==") ? "on" : "off";
  const inList = /\bin\s*[([{]([^)\]}]*)[)\]}]/.exec(value);
  if (inList) {
    const items = [...inList[1].matchAll(/["']([^"']*)["']/g)].map((m) => m[1]);
    return items.includes(d) ? "on" : "off";
  }
  const truthyWord = (s: string) => /^(?:true|1|yes|on|y|t)$/i.test(s);
  const falsyWord = (s: string) => /^(?:false|0|no|off|n|f|)$/i.test(s);
  if (/\benv\.bool\(|cast\s*=\s*bool|strtobool|\bget_bool|getboolean/i.test(value)) {
    return truthyWord(raw) ? "on" : falsyWord(raw) ? "off" : "unknown";
  }
  if (/\bint\(/.test(value)) return /^\d+$/.test(raw) ? (Number(raw) !== 0 ? "on" : "off") : "unknown";
  if (!quoted) return raw === "True" || /^[1-9]\d*$/.test(raw) ? "on" : raw === "False" || raw === "0" ? "off" : "unknown";
  // A bare string fallback (`bool(...)` or no wrapper): any non-empty string is truthy.
  return raw === "" ? "off" : "on";
}

/**
 * Spring configuration as dotted `key=value` lines, from either form: a `.properties`
 * file is already dotted; a YAML file nests (`management:` / `endpoints:` / `web:` …),
 * which the withheld actuator check never read, so a nested `include: "*"` passed.
 * List items under a key become one line each (`…include=*`).
 */
export function springDotted(text: string): string[] {
  const out: string[] = [];
  const stack: { indent: number; key: string }[] = [];
  for (const raw of text.split("\n")) {
    if (/^---\s*$/.test(raw)) {
      stack.length = 0;
      continue;
    }
    const line = raw.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, "");
    if (line.trim() === "") continue;
    const dotted = /^\s*([\w.[\]-]+)\s*[=:]\s*(.*)$/.exec(line);
    if (/^[\w.[\]-]+\s*=/.test(line.trim()) && !/^\s/.test(line)) {
      // properties form
      out.push(line.trim().replace(/\s*=\s*/, "="));
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      // `- "*"` belongs to the key above it, which may sit at the same indent.
      while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
      if (stack.length > 0) out.push(`${stack.map((s) => s.key).join(".")}=${item[1].trim()}`);
      continue;
    }
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const prefix = stack.map((s) => s.key).join(".");
    if (!dotted) continue;
    const key = prefix ? `${prefix}.${dotted[1]}` : dotted[1];
    const value = dotted[2].trim();
    if (value === "") stack.push({ indent, key: dotted[1] });
    else out.push(`${key}=${value}`);
  }
  return out;
}

/**
 * CORS configurations that allow credentials for every origin, read one config at a
 * time so an `origin` in one file never pairs with `credentials` in another.
 *
 * `reflects`: the library echoes the caller's Origin, so any site can read
 * credentialed responses: cors/Nest/Fastify `{ origin: true, credentials: true }`,
 * django-cors-headers `CORS_ALLOW_ALL_ORIGINS = True` with credentials, Starlette's
 * CORSMiddleware with `allow_origins=["*"]` and credentials, Flask-CORS with
 * `supports_credentials=True` and no origins list. `literal`: `origin: "*"` with
 * credentials, which browsers refuse, so it fails closed.
 */
export function corsCredentialFindings(ctx: {
  nodeSource: string;
  pySource: string;
  pySettings: string;
}): { reflects: string[]; literal: string[] } {
  const reflects: string[] = [];
  const literal: string[] = [];
  for (const m of ctx.nodeSource.matchAll(/\{[^{}]{0,400}\}/g)) {
    const obj = m[0];
    if (!/\bcredentials\s*:\s*true\b/.test(obj) || !/\borigin\s*:/.test(obj)) continue;
    if (/\borigin\s*:\s*true\b/.test(obj)) reflects.push("A CORS config sets `origin: true` with `credentials: true`");
    else if (/\borigin\s*:\s*["'`]\*["'`]/.test(obj)) literal.push("A CORS config sets `origin: \"*\"` with `credentials: true`");
  }
  const allowAll = /^\s*CORS_(?:ALLOW_ALL_ORIGINS|ORIGIN_ALLOW_ALL)\s*=\s*True\b/m.test(ctx.pySettings);
  if (allowAll && /^\s*CORS_ALLOW_CREDENTIALS\s*=\s*True\b/m.test(ctx.pySettings)) {
    reflects.push("Django settings set CORS_ALLOW_ALL_ORIGINS and CORS_ALLOW_CREDENTIALS to True");
  }
  for (const m of ctx.pySource.matchAll(/add_middleware\(\s*CORSMiddleware\s*,([^)]{0,600})\)/g)) {
    if (/allow_origins\s*=\s*\[\s*["']\*["']\s*\]/.test(m[1]) && /allow_credentials\s*=\s*True\b/.test(m[1])) {
      reflects.push("Starlette's CORSMiddleware allows every origin with allow_credentials=True");
    }
  }
  for (const m of ctx.pySource.matchAll(/\bCORS\(\s*\w+\s*,([^)]{0,400})\)/g)) {
    if (/supports_credentials\s*=\s*True\b/.test(m[1]) && !/\b(?:origins|resources)\s*=/.test(m[1])) {
      reflects.push("Flask-CORS is enabled with supports_credentials=True and no origins list");
    }
  }
  return { reflects: [...new Set(reflects)], literal: [...new Set(literal)] };
}

/**
 * Does the code own a long-running server process, and if so does it drain on SIGTERM?
 * Only a process the repository starts itself (`app.listen`, `createServer`, a Nest or
 * Fastify bootstrap) is graded. Spring Boot is graded by its `server.shutdown`
 * setting, and graceful by default from Boot 3.4.
 */
export function gracefulShutdownVerdict(
  ctx: { nodeSource: string; packageJson: string; springProps: string; frameworks: Set<string>; pySource: string; allConfig: string },
  paths: string[],
  coverage: number,
  pomAndGradle = "",
): { status: PulseScanCheckInput["status"]; detail: string } {
  const ownsNodeServer =
    /\.listen\(\s*(?:[\w.]*port\b|\d{2,5}\b|\{)|\bcreateServer\(|NestFactory\.create\(|\bfastify\(\s*[{)]/i.test(ctx.nodeSource);
  if (ownsNodeServer) {
    const drains =
      /\bSIGTERM\b|gracefulShutdown|server\.close\(|\bonShutdown\b|enableShutdownHooks\(|createTerminus|@godaddy\/terminus|http-terminator|createHttpTerminator|\bstoppable\b|close-with-grace|\blightship\b/i.test(
        ctx.nodeSource + ctx.packageJson,
      );
    return drains
      ? { status: "PASS", detail: "The server code handles SIGTERM (directly or through a shutdown helper), so in-flight requests can finish before the process exits." }
      : {
          status: "WARN",
          detail:
            "This repository starts its own Node server, and no SIGTERM handling was found. Every deploy and every " +
            "scale-down then stops the process mid-request, so some users see a connection reset on each release. " +
            "Close the server on SIGTERM (`process.on(\"SIGTERM\", () => server.close())`) or use a helper such as " +
            "@godaddy/terminus.",
        };
  }
  if (ctx.frameworks.has("spring")) {
    const setting = springDotted(ctx.springProps).find((l) => /^server\.shutdown=/i.test(l));
    if (setting) {
      return /=\s*["']?graceful/i.test(setting)
        ? { status: "PASS", detail: "Spring Boot is configured with server.shutdown=graceful." }
        : { status: "WARN", detail: "Spring Boot is configured with server.shutdown=immediate, so in-flight requests are cut off on every deploy. Set server.shutdown=graceful." };
    }
    const boot =
      /spring-boot-starter-parent<\/artifactId>\s*<version>(\d+)\.(\d+)/.exec(pomAndGradle) ??
      /org\.springframework\.boot["']?\)?\s*version\s*["'](\d+)\.(\d+)/.exec(pomAndGradle);
    if (boot && (Number(boot[1]) > 3 || (Number(boot[1]) === 3 && Number(boot[2]) >= 4))) {
      return { status: "PASS", detail: `Spring Boot ${boot[1]}.${boot[2]} shuts down gracefully by default, and server.shutdown is not overridden.` };
    }
    return {
      status: "INCONCLUSIVE",
      detail:
        "server.shutdown is not set. Spring Boot 3.4 and later shut down gracefully by default; earlier versions " +
        "stop immediately. The Boot version was not established, so this is not settled. Setting " +
        "server.shutdown=graceful makes it certain.",
    };
  }
  const appServerManaged =
    ctx.frameworks.has("django") || ctx.frameworks.has("rails") || ctx.frameworks.has("laravel") ||
    /\bfrom\s+(?:fastapi|flask|starlette)\s+import\b|\bimport\s+(?:fastapi|flask)\b/.test(ctx.pySource);
  if (appServerManaged || ctx.frameworks.has("next")) {
    return {
      status: "SKIPPED",
      detail:
        "The process is started by an app server or platform (gunicorn or uvicorn, Puma, PHP-FPM, `next start` or " +
        "a serverless deploy), which drains in-flight requests on SIGTERM itself, so the application code has " +
        "nothing to add.",
    };
  }
  if (paths.some((p) => /\.go$/i.test(p))) {
    return { status: "INCONCLUSIVE", detail: "This looks like a Go service. Pulse does not read Go shutdown handling (signal.Notify with http.Server.Shutdown), so this is not established." };
  }
  return coverage < 0.3
    ? { status: "INCONCLUSIVE", detail: `No server process started by this repository was found in the ${Math.round(coverage * 100)}% of source files read, which is too few to say there is none.` }
    : { status: "SKIPPED", detail: "No long-running server process started by this repository was found, so there is no shutdown for it to handle." };
}

/** Settings modules that configure a deployed environment and override the shared base. */
const PROD_SETTINGS = /(?:^|[/_-])(?:prod|production|live|deploy|deployment|staging|heroku)(?:_settings)?\.py$/i;

/** Settings modules a team keeps for development or tests, where DEBUG = True is the point. */
const DEV_SETTINGS =
  /(?:^|[/_-])(?:dev|develop|development|local|test|tests|testing|ci)(?:_settings)?\.py$|(?:^|\/)(?:local|test|dev)_?settings\.py$/i;

export function evaluateBackendServiceChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];

  // Checks whose adverse verdict is the ABSENCE of a pattern in the SAMPLED source.
  // The web sample is capped, so on a large repository "not found" is not "not
  // there": below the coverage threshold these self-downgrade to LOW, exactly as the
  // web-source family's absence() does. And a repository with no server-side code or
  // service manifest at all (a static page) has no service for them to grade.
  const SAMPLED_ABSENCE_KEYS = new Set([
    "svc_express_helmet",
    "svc_express_body_limit",
    "svc_express_rate_limit",
    "svc_session_cookie_flags",
    "svc_graceful_shutdown",
    "svc_health_endpoint",
    "svc_structured_logging",
    "svc_request_id",
    "svc_db_connection_pool",
    "svc_error_tracking",
  ]);
  const SOURCE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|go|java|cs)$/i;
  const sourcePaths = snapshot.paths.filter((p) => SOURCE_FILE.test(p) && !isVendoredPath(p));
  const sourceRead = [...snapshot.files.keys()].filter((p) => SOURCE_FILE.test(p) && !isVendoredPath(p)).length;
  const coverage = sampleCoverage(sourceRead, sourcePaths.length, snapshot.truncated);
  const isService =
    ctx.frameworks.size > 0 ||
    ctx.packageJson !== "" ||
    ctx.allConfig !== "" ||
    sourcePaths.some((p) => /\.(py|rb|php|go|java|cs)$/i.test(p)) ||
    // A Deno service has no package.json.
    snapshot.paths.some((p) => /(^|\/)deno\.jsonc?$/i.test(p));

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    confidenceOverride?: PulseScanCheckInput["confidence"],
  ) => {
    let finalStatus = status;
    let finalDetail = detail;
    let confidence: PulseScanCheckInput["confidence"] = confidenceOverride ?? (status === "INCONCLUSIVE" ? "LOW" : "HIGH");
    if (SAMPLED_ABSENCE_KEYS.has(checkKey) && status !== "SKIPPED") {
      if (!isService) {
        finalStatus = "SKIPPED";
        finalDetail =
          "No server-side code or service manifest was found in this repository, so this service check does not apply.";
      } else if (status === "WARN" && coverage < 0.3) {
        confidence = "LOW";
        finalDetail =
          `${detail} (Based on ${Math.round(coverage * 100)}% of this project's source files — below the threshold ` +
          `for a confident "not present anywhere", so this is inconclusive rather than a failure.)`;
      }
    }
    checks.push({
      category: finalStatus === "SKIPPED" ? CATEGORIES.INFRASTRUCTURE : CATEGORIES.SECURITY,
      checkKey,
      label,
      status: finalStatus,
      confidence,
      detail: finalDetail,
    });
  };

  const skip = (key: string, label: string, what: string) =>
    add(key, label, "SKIPPED", `${what} was not detected in this repository, so this check does not apply.`);

  const has = (f: string) => ctx.frameworks.has(f);

  // ── Django — from the official deployment checklist ────────────────────────
  if (has("django") && ctx.pySettings) {
    // DEBUG and SECRET_KEY are judged per settings module. A development or test module
    // (settings/dev.py, local_settings.py) is meant to run with DEBUG on and a throwaway
    // key, so it is not read. A value taken from the environment is judged by its
    // committed FALLBACK: `os.environ.get("DEBUG", "True")` is debug on whenever the
    // variable is unset, and the withheld version passed it as "read from the environment".
    // A production module that assigns the setting overrides the shared base, so
    // `base.py: DEBUG = True` with `production.py: DEBUG = False` is judged on production.py.
    const prodSettings = ctx.pySettingsFiles.filter(([p]) => !DEV_SETTINGS.test(p));
    // An assignment inside an if/else in the production module (bakerydemo sets SECRET_KEY
    // from the environment or generates one) still overrides the base.
    const decidingModules = (name: string): { modules: [string, string][]; anyIndent: boolean } => {
      const overriding = prodSettings.filter(([p, t]) => PROD_SETTINGS.test(p) && pyAssignments(t, name, true).length > 0);
      return overriding.length > 0 ? { modules: overriding, anyIndent: true } : { modules: prodSettings, anyIndent: false };
    };
    const debugOn: string[] = [];
    const debugFallbackOn: string[] = [];
    const debugUnknown: string[] = [];
    const debugDecider = decidingModules("DEBUG");
    for (const [path, text] of debugDecider.modules) {
      const value = debugDecider.anyIndent ? pyAssignments(text, "DEBUG", true).pop() ?? null : pyAssignment(text, "DEBUG");
      if (value === null) continue;
      const env = pyEnvFallback(value);
      if (!env.readsEnv) {
        if (/^True$|^1$/.test(value)) debugOn.push(path);
        else if (!/^False$|^0$/.test(value)) debugUnknown.push(path);
        continue;
      }
      const on = pyDebugFallbackOn(value);
      if (on === "on") debugFallbackOn.push(path);
      else if (on === "unknown") debugUnknown.push(path);
    }
    add(
      "svc_django_debug",
      "Django DEBUG is not enabled in the committed settings",
      prodSettings.length === 0
        ? "INCONCLUSIVE"
        : debugOn.length > 0
          ? "FAIL"
          : debugFallbackOn.length > 0
            ? "WARN"
            : debugUnknown.length > 0
              ? "INCONCLUSIVE"
              : "PASS",
      prodSettings.length === 0
        ? "Only development or test settings modules were read, so the production DEBUG value was not seen."
        : debugOn.length > 0
          ? `DEBUG = True is committed in ${debugOn.join(", ")}. With debug on, Django returns a full traceback, every ` +
            "local variable and the settings module on any unhandled error, including the database credentials. It " +
            "also disables ALLOWED_HOSTS enforcement and keeps every SQL query in memory."
          : debugFallbackOn.length > 0
            ? `DEBUG is read from the environment in ${debugFallbackOn.join(", ")}, but its committed fallback turns ` +
              "debug ON whenever the variable is unset (a string such as \"False\" is truthy in Python). A deploy that " +
              "forgets the variable then serves full tracebacks. Make the fallback off, for example " +
              "`DEBUG = os.environ.get(\"DEBUG\") == \"1\"`."
            : debugUnknown.length > 0
              ? `DEBUG in ${debugUnknown.join(", ")} is set by an expression Pulse could not evaluate, so whether it ` +
                "can be on in production is not established."
              : "DEBUG is off in the committed production settings, or read from the environment with a fallback " +
                "that is off when the variable is unset.",
    );

    const keyLiteral: string[] = [];
    const keyFallback: string[] = [];
    const keyPlaceholder: string[] = [];
    const keyDecider = decidingModules("SECRET_KEY");
    for (const [path, text] of keyDecider.modules) {
      // Every assignment in the deciding module counts: a literal in either branch of an
      // if/else is committed.
      for (const value of pyAssignments(text, "SECRET_KEY", keyDecider.anyIndent)) {
      const env = pyEnvFallback(value);
      const literal = env.readsEnv ? env.fallback : value;
      if (literal === null || !isStringLiteral(literal)) continue;
      const keyText = unquote(literal);
      if (keyText === "") continue; // Django refuses to start with an empty SECRET_KEY.
      const real =
        /^django-insecure/.test(keyText) ||
        (/^[\w!@#$%^&*()_+=\-]{20,}$/.test(keyText) && !/change|example|placeholder|dummy|your|secret[-_]?key/i.test(keyText));
      if (!env.readsEnv) (real ? keyLiteral : keyPlaceholder).push(path);
      else (real ? keyFallback : keyPlaceholder).push(path);
      }
    }
    add(
      "svc_django_secret_key",
      "Django SECRET_KEY is not hardcoded",
      prodSettings.length === 0
        ? "INCONCLUSIVE"
        : keyLiteral.length > 0 || keyFallback.length > 0
          ? "FAIL"
          : keyPlaceholder.length > 0
            ? "WARN"
            : "PASS",
      prodSettings.length === 0
        ? "Only development or test settings modules were read, so the production SECRET_KEY was not seen."
        : keyLiteral.length > 0 || keyFallback.length > 0
          ? `A real SECRET_KEY is committed in ${[...keyLiteral, ...keyFallback].join(", ")}` +
            (keyFallback.length > 0 ? ", as the fallback used when the environment variable is unset" : "") +
            ". It signs session cookies and password-reset tokens, so anyone with repository access can forge a " +
            "session for any user, staff included. The `django-insecure-` prefix means it is still the value " +
            "`startproject` generated. Rotate it and remove the fallback; deleting the line leaves it in git history."
          : keyPlaceholder.length > 0
            ? `SECRET_KEY in ${keyPlaceholder.join(", ")} is, or falls back to, a placeholder string. Unless something ` +
              "replaces it at deploy time, Django signs sessions with a key that is printed in your repository. Read " +
              "it with `os.environ[\"SECRET_KEY\"]` so a missing value stops the process instead."
            : "SECRET_KEY is read from the environment with no committed key as a fallback.",
    );

    const hosts = pySetting(ctx.pySettings, "ALLOWED_HOSTS");
    add(
      "svc_django_allowed_hosts",
      "Django ALLOWED_HOSTS is not a wildcard",
      hosts === null ? "PASS" : /\[\s*["']\*["']\s*\]/.test(hosts) ? "WARN" : "PASS",
      hosts === null
        ? "ALLOWED_HOSTS is supplied from the environment."
        : /\[\s*["']\*["']\s*\]/.test(hosts)
          ? "ALLOWED_HOSTS = ['*'] accepts any Host header. Django uses that header to build absolute URLs, so an " +
            "attacker-supplied host ends up in password-reset emails — the classic host-header poisoning route to " +
            "account takeover."
          : "ALLOWED_HOSTS names specific hosts.",
    );

    for (const [key2, label, setting, why] of [
      [
        "svc_django_ssl_redirect",
        "Django redirects HTTP to HTTPS",
        "SECURE_SSL_REDIRECT",
        "Without it a request that arrives over HTTP is served over HTTP, so a session cookie can be read in transit.",
      ],
      [
        "svc_django_hsts",
        "Django sets an HSTS max-age",
        "SECURE_HSTS_SECONDS",
        "Without HSTS the first request of every session is still downgradeable, which is where session-stealing " +
          "attacks on public networks happen.",
      ],
      [
        "svc_django_content_type_nosniff",
        "Django sends X-Content-Type-Options",
        "SECURE_CONTENT_TYPE_NOSNIFF",
        "Without it a browser may execute an uploaded file as script because its contents look like JavaScript.",
      ],
    ] as const) {
      const v = pySetting(ctx.pySettings, setting);
      const on = v !== null && !/false|^0$/i.test(v);
      if (key2 === "svc_django_content_type_nosniff") {
        // SECURE_CONTENT_TYPE_NOSNIFF defaults to True since Django 3.0, so leaving it
        // unset SENDS the header. Only an explicit False, or a pinned Django older than
        // 3.0, leaves it off. A value read from the environment is not established.
        const raw = pyAssignment(ctx.pySettings, setting);
        const fromEnv = raw !== null && pyEnvFallback(raw).readsEnv;
        const oldDjango = ctx.djangoMajor !== null && ctx.djangoMajor < 3;
        const off = (v !== null && !on) || (raw === null && oldDjango);
        add(
          key2,
          label,
          off ? "WARN" : fromEnv ? "INCONCLUSIVE" : "PASS",
          off
            ? raw === null
              ? `Django ${ctx.djangoMajor} is pinned and ${setting} is not set; before Django 3.0 it defaulted to ` +
                `False, so the header is not sent. ${why}`
              : `${setting} is disabled. ${why}`
            : fromEnv
              ? `${setting} is read from the environment, so whether the header is sent is not established.`
              : raw === null
                ? `${setting} is not set, so Django's default applies: it has been True since Django 3.0 and no older ` +
                  "Django is pinned, so the X-Content-Type-Options: nosniff header is sent."
                : `${setting} is enabled.`,
        );
        continue;
      }
      add(
        key2,
        label,
        v === null ? "WARN" : on ? "PASS" : "WARN",
        v === null
          ? `${setting} is not set in the committed settings. ${why} This is one of the settings ` +
            "`manage.py check --deploy` reports."
          : on
            ? `${setting} is configured.`
            : `${setting} is disabled. ${why}`,
      );
    }

    const sessionSecure = pySetting(ctx.pySettings, "SESSION_COOKIE_SECURE");
    const csrfSecure = pySetting(ctx.pySettings, "CSRF_COOKIE_SECURE");
    const bothOn = [sessionSecure, csrfSecure].every((v) => v !== null && !/false/i.test(v));
    add(
      "svc_django_secure_cookies",
      "Django session and CSRF cookies are HTTPS-only",
      bothOn ? "PASS" : "WARN",
      bothOn
        ? "SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE are both set, so neither cookie is sent over plain HTTP."
        : "SESSION_COOKIE_SECURE and/or CSRF_COOKIE_SECURE are not enabled. The session cookie is then transmitted " +
          "on any plain-HTTP request to the domain — including one triggered by an image tag on another site — " +
          "which is enough to capture it on a shared network.",
    );
  } else {
    for (const k of CATALOGUE.filter(([k]) => k.startsWith("svc_django_"))) skip(k[0], k[1], "Django");
  }

  // ── Rails ──────────────────────────────────────────────────────────────────
  if (has("rails")) {
    const forceSsl = /config\.force_ssl\s*=\s*true/.test(ctx.railsProd);
    add(
      "svc_rails_force_ssl",
      "Rails forces SSL in production",
      !ctx.railsProd ? "SKIPPED" : forceSsl ? "PASS" : "WARN",
      !ctx.railsProd
        ? "config/environments/production.rb was not read."
        : forceSsl
          ? "config.force_ssl is enabled, so Rails redirects to HTTPS and marks cookies secure."
          : "config.force_ssl is not enabled in production. That one setting turns on the HTTPS redirect, the " +
            "Secure cookie flag and HSTS together; without it those protections exist only if a TLS-terminating " +
            "proxy or the application's own code provides them, which the Rails configuration read here does not show.",
    );

    const secretCommitted = snapshot.paths.some((p) => /config\/master\.key$|config\/credentials\.yml$/i.test(p));
    add(
      "svc_rails_secret_committed",
      "Rails credentials are not committed in plaintext",
      secretCommitted ? "FAIL" : "PASS",
      secretCommitted
        ? "config/master.key or an unencrypted credentials file is committed. The master key decrypts every " +
          "credential Rails holds — database, third-party APIs, signing secrets — so committing it makes the " +
          "encrypted credentials file no protection at all."
        : "No Rails master key or plaintext credentials file is committed.",
    );

    const eagerLoad = /config\.eager_load\s*=\s*true/.test(ctx.railsProd);
    add(
      "svc_rails_eager_load",
      "Rails eager-loads code in production",
      !ctx.railsProd ? "SKIPPED" : eagerLoad ? "PASS" : "WARN",
      !ctx.railsProd
        ? "config/environments/production.rb was not read."
        : eagerLoad
          ? "config.eager_load is true, so classes are loaded at boot rather than per request."
          : "config.eager_load is not enabled in production. Code is then autoloaded on first use, which is slower " +
            "for the unlucky first request and is not thread-safe under a threaded server such as Puma.",
    );
  } else {
    for (const k of CATALOGUE.filter(([k]) => k.startsWith("svc_rails_"))) skip(k[0], k[1], "Rails");
  }

  // ── Laravel ────────────────────────────────────────────────────────────────
  if (has("laravel")) {
    const debugTrue = /APP_DEBUG\s*=\s*true/i.test(ctx.envExample);
    add(
      "svc_laravel_debug",
      "Laravel APP_DEBUG is not enabled",
      debugTrue ? "WARN" : "PASS",
      debugTrue
        ? "APP_DEBUG=true is set in the committed environment template. Laravel's debug page renders the full stack " +
          "trace and every environment variable — including database and mail credentials — on any unhandled " +
          "exception. If this template is copied to production as-is, that page is public."
        : "APP_DEBUG is not enabled in the committed environment template.",
    );
    const appKey = /APP_KEY\s*=\s*base64:[A-Za-z0-9+/=]{20,}/.test(ctx.envExample);
    add(
      "svc_laravel_app_key",
      "Laravel APP_KEY is not a committed literal",
      appKey ? "FAIL" : "PASS",
      appKey
        ? "A real APP_KEY is committed in the environment template. Laravel uses it for all encryption and cookie " +
          "signing, so anyone with the repository can decrypt session data and forge signed URLs. Run " +
          "`php artisan key:generate` for a fresh key and keep the placeholder empty."
        : "No literal APP_KEY is committed.",
    );
  } else {
    for (const k of CATALOGUE.filter(([k]) => k.startsWith("svc_laravel_"))) skip(k[0], k[1], "Laravel");
  }

  // ── Spring Boot ────────────────────────────────────────────────────────────
  if (has("spring")) {
    // Read the setting as a value, in either the dotted .properties form or nested YAML.
    const actuatorAll = springDotted(ctx.springProps).some((l) => {
      const m = /^management\.endpoints\.web\.exposure\.include=(.*)$/i.exec(l);
      return m !== null && m[1].replace(/[[\]"']/g, "").split(",").some((v) => v.trim() === "*");
    });
    add(
      "svc_spring_actuator_exposure",
      "Spring actuator endpoints are not fully exposed",
      !ctx.springProps ? "SKIPPED" : actuatorAll ? "FAIL" : "PASS",
      !ctx.springProps
        ? "No application properties file was read."
        : actuatorAll
          ? "Actuator exposure is set to `*`, publishing every management endpoint over HTTP. That includes /env " +
            "(all configuration, credentials included), /heapdump (a full memory image, which contains live session " +
            "tokens) and /threaddump. These are routinely found unauthenticated on the public internet."
          : "Actuator endpoints are not wildcard-exposed.",
    );
    const h2 = /spring\.h2\.console\.enabled\s*[=:]\s*true/i.test(ctx.springProps);
    add(
      "svc_spring_h2_console",
      "The Spring H2 console is not enabled",
      !ctx.springProps ? "SKIPPED" : h2 ? "FAIL" : "PASS",
      !ctx.springProps
        ? "No application properties file was read."
        : h2
          ? "The H2 database console is enabled. It is a full web SQL client, it is frequently left unauthenticated, " +
            "and it has a history of RCE through JDBC URL handling."
          : "The H2 console is not enabled.",
    );
  } else {
    for (const k of CATALOGUE.filter(([k]) => k.startsWith("svc_spring_"))) skip(k[0], k[1], "Spring Boot");
  }

  // ── Node services ──────────────────────────────────────────────────────────
  const isNode = has("express") || has("next");
  if (isNode) {
    // Header names count only as quoted literals (next.config headers() keys, headers.set()),
    // not as a bare mention in a comment or log line.
    const helmet = /helmet|@fastify\/helmet|contentSecurityPolicy|["'](Content-Security-Policy|X-Content-Type-Options)["']/i.test(
      ctx.packageJson + ctx.nodeSource,
    );
    add(
      "svc_express_helmet",
      "Express sets security headers",
      helmet ? "PASS" : "WARN",
      helmet
        ? "A security-header middleware or security-header configuration is present."
        : "No security-header middleware (helmet or equivalent) or security-header configuration (such as " +
          "headers() in next.config) was found. Neither Express nor Next.js sends a CSP, X-Content-Type-Options " +
          "or Referrer-Policy by default, so unless a proxy or CDN adds them those defences are simply absent " +
          "rather than misconfigured.",
    );
    const bodyLimit = /limit:\s*["']\d+[kmKM]b?["']|bodyLimit|maxRequestBodySize/i.test(ctx.nodeSource);
    // body-parser / express.json() / urlencoded() cap bodies at 100kb by default, and
    // Next.js API routes and Server Actions at 1MB. A missing explicit limit is only an
    // exposure where a body is read with NO default cap: a multipart upload library, a
    // raw request stream, or an App Router handler reading the body itself.
    const uncappedBody =
      /multer|busboy|formidable|bodyParser:\s*false|\.on\(\s*["']data["']|\b(req|request)\.(json|text|formData|arrayBuffer|blob)\(\)|\b(req|request)\.pipe\(|\.body\.getReader\(\)/i.test(
        ctx.packageJson + ctx.nodeSource,
      );
    add(
      "svc_express_body_limit",
      "The request body size is capped",
      bodyLimit || !uncappedBody ? "PASS" : "WARN",
      bodyLimit
        ? "A request body size limit is configured."
        : !uncappedBody
          ? "No explicit body limit is set, but the body parsers in use apply a default cap (100kb for " +
            "express.json()/body-parser, 1MB for Next.js API routes and Server Actions) and no uncapped upload " +
            "parser or raw body read was found."
          : "A request body is read without a size cap — an upload parser (multer, busboy, formidable), a raw " +
            "request stream, or a route handler calling request.json()/text()/formData()/blob() — and no explicit " +
            "limit was found. One request can then allocate as much memory as the client cares to send, the " +
            "cheapest denial-of-service there is against a Node process.",
    );
    const rateLimit = /rate-?limit|rateLimiter|@upstash\/ratelimit|slowDown/i.test(ctx.packageJson + ctx.nodeSource);
    add(
      "svc_express_rate_limit",
      "The service applies rate limiting",
      rateLimit ? "PASS" : "WARN",
      rateLimit
        ? "Rate limiting is configured."
        : "No rate limiting was found. Without it, login and password-reset endpoints can be attacked at whatever " +
          "rate the network allows, and any expensive endpoint is a denial-of-service lever.",
    );
    const trustProxy = /trust proxy|trustProxy|X-Forwarded-For/i.test(ctx.nodeSource);
    add(
      "svc_express_trust_proxy",
      "Proxy trust is configured explicitly",
      trustProxy ? "PASS" : "SKIPPED",
      trustProxy
        ? "Proxy trust is configured, so client IPs and the protocol are read correctly behind a load balancer."
        : "No proxy trust configuration was found. This matters only when the service runs behind a reverse proxy — " +
          "where getting it wrong makes every client appear to share the proxy's IP, which silently defeats " +
          "IP-based rate limiting. Reported as not established rather than as a fault.",
    );
  } else {
    for (const k of CATALOGUE.filter(([k]) => k.startsWith("svc_express_"))) skip(k[0], k[1], "Express/Fastify/Next");
  }

  // ── Cross-framework ────────────────────────────────────────────────────────
  const all = ctx.allConfig + ctx.nodeSource;
  const cors = corsCredentialFindings(ctx);
  const thinSample = coverage < 0.3;
  add(
    "svc_cors_wildcard",
    "CORS does not combine a wildcard origin with credentials",
    cors.reflects.length > 0 ? "FAIL" : cors.literal.length > 0 ? "WARN" : "PASS",
    cors.reflects.length > 0
      ? `${cors.reflects.join("; ")}. With credentials allowed, that echoes back whatever Origin the browser sends, so ` +
        "any website a signed-in user visits can call your API with their cookies attached and read the response. " +
        "List the origins you trust instead."
      : cors.literal.length > 0
        ? `${cors.literal.join("; ")}. Browsers refuse a credentialed response with a literal \`*\` origin, so this ` +
          "configuration breaks signed-in cross-origin calls rather than exposing them. The usual next step, " +
          "reflecting the request's Origin, is the exposure; list the origins you trust instead."
        : thinSample
          ? `No CORS configuration combining every origin with credentials was found in the ` +
            `${Math.round(coverage * 100)}% of source files read, which is too few to establish it is absent.`
          : "No CORS configuration combining every origin with credentials was found.",
    cors.reflects.length === 0 && cors.literal.length === 0 && thinSample ? "LOW" : undefined,
  );

  // NextAuth/Auth.js and iron-session issue their session cookie HttpOnly + SameSite=Lax
  // by default, so an app using them has both flags without writing either.
  // The library vouches only for ITS cookie: an app that also writes cookies itself
  // (res.cookie, cookies().set, a Set-Cookie header) must set the flags on those, so
  // there the library alone does not pass.
  const explicitFlags = /httpOnly:\s*true/i.test(all) && /sameSite/i.test(all);
  const libraryCookie = /["']next-auth(\/[\w/-]+)?["']|["']@auth\/(core|nextjs|express)["']|["']iron-session["']/.test(
    ctx.packageJson + all,
  );
  const manualCookieWrite = /\bres\.cookie\(|cookies\(\)\.set\(|\.cookies\.set\(|\bsetCookie\(|["']Set-Cookie["']/i.test(all);
  const cookieFlags = explicitFlags || (libraryCookie && !manualCookieWrite);
  const setsCookies = /cookie|session/i.test(all);
  add(
    "svc_session_cookie_flags",
    "Session cookies set HttpOnly, Secure and SameSite",
    !setsCookies ? "SKIPPED" : cookieFlags ? "PASS" : "WARN",
    !setsCookies
      ? "No cookie or session handling was found in the configuration read."
      : cookieFlags
        ? explicitFlags
          ? "Cookies are configured with HttpOnly and SameSite."
          : "The session cookie is issued by an auth library (NextAuth/Auth.js or iron-session) that sets HttpOnly " +
            "and SameSite by default, and no other cookie write was found in the code read."
        : "Session cookie flags (HttpOnly, SameSite) were not found. Without HttpOnly a single XSS reads the session " +
          "token directly; without SameSite the cookie is attached to cross-site requests, which is what CSRF is.",
  );

  // Graceful shutdown is only this repository's job when the code owns the process.
  // An app server (gunicorn, uvicorn, Puma, PHP-FPM) or `next start` drains in-flight
  // requests on SIGTERM by itself, and a serverless deploy has no long-lived process.
  // The withheld version told vercel/commerce it dropped requests on every deploy.
  const buildFiles = [...snapshot.files]
    .filter(([p]) => /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/i.test(p))
    .map(([, t]) => t)
    .join("\n");
  const shutdown = gracefulShutdownVerdict(ctx, snapshot.paths, coverage, buildFiles);
  add(
    "svc_graceful_shutdown",
    "The service shuts down gracefully",
    shutdown.status,
    shutdown.detail,
  );

  const health = /\/health|\/healthz|\/readyz|\/livez|\/_health|actuator\/health|@Get\(\s*["'`]\/?health/i.test(
    all + snapshot.paths.join("\n"),
  );
  add(
    "svc_health_endpoint",
    "The service exposes a health endpoint",
    health ? "PASS" : "WARN",
    health
      ? "A health endpoint is present, so the orchestrator and uptime monitoring can distinguish running from working."
      : "No health endpoint was found. Without one, a load balancer routes to a process that has started but cannot " +
        "reach its database, and a rolling deploy of a broken build completes successfully.",
  );

  // tslog defaults to "pretty" (free text); it is structured only when configured with type "json".
  const structuredLogs =
    /pino|winston|bunyan|structlog|logback|slf4j|semantic_logger|zap\.|logrus/i.test(ctx.packageJson + all) ||
    (/tslog/i.test(ctx.packageJson + all) && /\btype:\s*[^,\n}]*["']json["']/i.test(all));
  add(
    "svc_structured_logging",
    "Logs are structured rather than free text",
    structuredLogs ? "PASS" : "WARN",
    structuredLogs
      ? "A structured logging library is configured, so logs can be queried by field."
      : "No structured logging library was found. console.log output cannot be filtered by request, user or " +
        "severity, so during an incident the logs are a wall of text at exactly the moment they need to be a query.",
  );

  // Rails ships ActionDispatch::RequestId in its default middleware stack: every
  // response carries X-Request-Id. Keyed on Rails::Application, not on a bare Gemfile
  // (Sinatra/Roda apps have a Gemfile but no such middleware).
  const requestId =
    /Rails::Application/.test(ctx.railsProd) ||
    /request-?id|correlation-?id|traceparent|x-request-id/i.test(all + ctx.nodeSource);
  add(
    "svc_request_id",
    "Requests carry a correlation id",
    requestId ? "PASS" : "WARN",
    requestId
      ? "Requests carry a correlation id, so one user's journey can be followed across services."
      : "No request correlation id was found. With more than one service, a user's report of 'it failed at 3pm' " +
        "cannot be tied to a specific request chain — every log line has to be matched by timestamp and guesswork.",
  );

  // `kb.dataSources` (an AWS Bedrock knowledge-base field) is not a database, so
  // "datasource" must not be followed by "s". "database" stays a substring match:
  // databaseName, MongoDatabase and DatabaseService are real database signals, and a
  // word boundary there would SKIP a real service.
  const usesDb = /database|datasource(?!s)/i.test(all);
  // Prisma, Sequelize, TypeORM, Knex, Mongoose and ActiveRecord pool connections by
  // default, so a project using one is pooled without a pool setting being written.
  // ActiveRecord is keyed on real Rails/AR evidence, not on a bare Gemfile (Sinatra, Jekyll).
  const pool =
    /Rails::Application|ActiveRecord/.test(all) ||
    /pool|POOL_SIZE|CONN_MAX_AGE|HikariCP|max_connections|connectionLimit|@prisma\/client|PrismaClient|sequelize|typeorm|knex|mongoose/i.test(
      ctx.packageJson + all,
    );
  add(
    "svc_db_connection_pool",
    "Database connections are pooled",
    !usesDb ? "SKIPPED" : pool ? "PASS" : "WARN",
    !usesDb
      ? "No database configuration was read, so pooling does not apply."
      : pool
        ? "Connection pooling is configured, explicitly or through a database client that pools by default."
        : "No connection pool configuration was found. Opening a connection per request costs a round trip each time " +
          "and exhausts the database's connection limit under load — which fails as timeouts on unrelated queries, " +
          "so it is rarely diagnosed as a pooling problem.",
  );

  const migrations = snapshot.paths.some((p) =>
    /(migrations|db\/migrate|prisma\/migrations|alembic)\/.*\.(sql|py|rb|ts|js)$/i.test(p),
  );
  add(
    "svc_db_migrations_versioned",
    "Schema changes are versioned migrations",
    !usesDb ? "SKIPPED" : migrations ? "PASS" : "WARN",
    !usesDb
      ? "No database configuration was read."
      : migrations
        ? "Schema changes are committed as versioned migrations, so the database can be rebuilt from the repository."
        : "No migration files were found alongside a database configuration. If the schema is changed by hand, " +
          "there is no record of how production got to its current shape and no reliable way to bring a new " +
          "environment to the same state.",
  );

  // [ \t]* not \s*: \s* crosses the newline after an EMPTY value, so `NEXTAUTH_SECRET=`
  // followed by `GITHUB_CLIENT_ID=` read the next variable's NAME as a credential.
  const envSecrets = /^[A-Z_]*(SECRET|PASSWORD|TOKEN|API_?KEY)[A-Z_]*[ \t]*=[ \t]*(?!$|["']?(your|changeme|xxx|<|\$))[\w./+-]{12,}/m.test(
    ctx.envExample,
  );
  add(
    "svc_env_example_no_secrets",
    "The example environment file carries no real secrets",
    !ctx.envExample ? "SKIPPED" : envSecrets ? "FAIL" : "PASS",
    !ctx.envExample
      ? "No .env.example file was found."
      : envSecrets
        ? "The committed .env.example contains what looks like a real credential rather than a placeholder. The file " +
          "exists to be committed, so anything in it is public to everyone with repository access."
        : "The example environment file contains placeholders rather than real values.",
  );

  const lockfile = snapshot.paths.some((p) =>
    /(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?|poetry\.lock|Pipfile\.lock|uv\.lock|pdm\.lock|Gemfile\.lock|composer\.lock|go\.sum|Cargo\.lock|deno\.lock|gradle\.lockfile|packages\.lock\.json)$/i.test(
      p,
    ),
  );
  // No dependency manifest means nothing is installed, so there is nothing to lock.
  const hasManifest = snapshot.paths.some((p) =>
    /(^|\/)(package\.json|requirements[\w.-]*\.txt|requirements\/[\w.-]+\.txt|Pipfile|pyproject\.toml|setup\.py|setup\.cfg|Gemfile|composer\.json|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|deno\.jsonc?|[\w.-]+\.csproj)$/i.test(p),
  );
  add(
    "svc_dependency_lockfile",
    "A dependency lockfile is committed",
    !hasManifest ? "SKIPPED" : lockfile ? "PASS" : "WARN",
    !hasManifest
      ? "No dependency manifest was found, so there are no installed dependencies to lock."
      : lockfile
      ? "A lockfile is committed, so every environment installs the same dependency versions."
      : "No lockfile is committed. Each install resolves versions afresh, so the build is not reproducible and a " +
        "malicious or broken release of a transitive dependency reaches production without any change here.",
  );

  const errorTracking = /sentry|bugsnag|rollbar|honeybadger|airbrake|datadog|newrelic|opentelemetry|logster|appsignal/i.test(
    ctx.packageJson + all,
  );
  add(
    "svc_error_tracking",
    "The service reports errors to a tracker",
    errorTracking ? "PASS" : "WARN",
    errorTracking
      ? "An error tracking or APM integration is configured."
      : "No error tracking integration was found. Server errors then exist only in logs nobody is watching, so the " +
        "first report of a production failure comes from a user rather than from monitoring.",
  );

  const stackLeak = /res\.(send|json)\(\s*(err|error)(\.stack)?\s*\)|printStackTrace\(\)\s*;.*response|traceback\.format_exc\(\).*return/i.test(
    ctx.nodeSource,
  );
  add(
    "svc_stack_trace_leak",
    "Stack traces are not returned to clients",
    stackLeak ? "FAIL" : "PASS",
    stackLeak
      ? "An error handler returns the error object or stack trace in the HTTP response. A stack trace names internal " +
        "file paths, framework versions and often the failing query — everything an attacker needs to choose a next " +
        "step, handed over by triggering an error."
      : "No handler was found returning a raw error or stack trace to the client.",
  );

  return checks;
}

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

export type BackendFramework = "django" | "rails" | "laravel" | "spring" | "express" | "next" | null;

interface Ctx {
  frameworks: Set<string>;
  pySettings: string;
  railsProd: string;
  laravelConfig: string;
  springProps: string;
  nodeSource: string;
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

  for (const [path, text] of snapshot.files) {
    if (/settings(_?\w*)?\.py$/i.test(path)) py.push(text);
    else if (/config\/environments\/production\.rb$/i.test(path)) rails.push(text);
    else if (/config\/(application|storage|database)\.rb$/i.test(path)) rails.push(text);
    else if (/composer\.json$/i.test(path) || /(^|\/)config\/app\.php$/i.test(path)) laravel.push(text);
    else if (/application(-\w+)?\.(properties|ya?ml)$/i.test(path)) spring.push(text);
    else if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
    else if (/\.env\.example$/i.test(path)) envExample.push(text);
    if (/\.(ts|js|mjs|cjs)$/i.test(path)) node.push(text);
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
    pySettings: py.join("\n"),
    railsProd: rails.join("\n"),
    laravelConfig: laravel.join("\n"),
    springProps: spring.join("\n"),
    nodeSource: node.join("\n"),
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

export function evaluateBackendServiceChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
  ) => {
    checks.push({
      category: status === "SKIPPED" ? CATEGORIES.INFRASTRUCTURE : CATEGORIES.SECURITY,
      checkKey,
      label,
      status,
      confidence: "HIGH",
      detail,
    });
  };

  const skip = (key: string, label: string, what: string) =>
    add(key, label, "SKIPPED", `${what} was not detected in this repository, so this check does not apply.`);

  const has = (f: string) => ctx.frameworks.has(f);

  // ── Django — from the official deployment checklist ────────────────────────
  if (has("django") && ctx.pySettings) {
    const debug = pySetting(ctx.pySettings, "DEBUG");
    add(
      "svc_django_debug",
      "Django DEBUG is not enabled in the committed settings",
      debug === null ? "PASS" : /true/i.test(debug) ? "FAIL" : "PASS",
      debug === null
        ? "DEBUG is read from the environment rather than written in, which is the recommended pattern."
        : /true/i.test(debug)
          ? "DEBUG = True is committed in settings. With debug on, Django returns a full traceback, every local " +
            "variable, and the settings module on any unhandled error — including the database credentials. It also " +
            "disables ALLOWED_HOSTS enforcement and retains every SQL query in memory, which leaks slowly until the " +
            "process dies."
          : "DEBUG is set to False in the committed settings.",
    );

    const key = pySetting(ctx.pySettings, "SECRET_KEY");
    add(
      "svc_django_secret_key",
      "Django SECRET_KEY is not hardcoded",
      key === null ? "PASS" : /^["']django-insecure|^["'][\w!@#$%^&*()_+=-]{20,}["']$/.test(key) ? "FAIL" : "WARN",
      key === null
        ? "SECRET_KEY is read from the environment."
        : "SECRET_KEY is a literal in committed settings. It signs session cookies and password-reset tokens, so " +
          "anyone with repository access can forge a session for any user — including staff. The `django-insecure-` " +
          "prefix means it is still the value `startproject` generated. Rotate it; removing the line leaves it in " +
          "git history.",
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
          : "config.force_ssl is not enabled in production. One setting turns on the HTTPS redirect, the Secure " +
            "cookie flag and HSTS together, so leaving it off costs all three.",
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
    const actuatorAll = /management\.endpoints\.web\.exposure\.include\s*[=:]\s*["']?\*/i.test(ctx.springProps);
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
    const helmet = /helmet|@fastify\/helmet|contentSecurityPolicy/i.test(ctx.packageJson + ctx.nodeSource);
    add(
      "svc_express_helmet",
      "Express sets security headers",
      helmet ? "PASS" : "WARN",
      helmet
        ? "A security-header middleware is configured."
        : "No security-header middleware (helmet or equivalent) was found. Express sends no CSP, no " +
          "X-Content-Type-Options and no Referrer-Policy by default, so every one of those defences is simply " +
          "absent rather than misconfigured.",
    );
    const bodyLimit = /limit:\s*["']\d+[kmKM]b?["']|bodyLimit|maxRequestBodySize/i.test(ctx.nodeSource);
    add(
      "svc_express_body_limit",
      "The request body size is capped",
      bodyLimit ? "PASS" : "WARN",
      bodyLimit
        ? "A request body size limit is configured."
        : "No request body limit was found. express.json() defaults to 100kb, but a raw body parser or a file " +
          "upload route without a cap lets one request allocate as much memory as the client cares to send — the " +
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
  const corsWildcardCreds =
    /origin:\s*["']\*["']/.test(all) && /credentials:\s*true/.test(all);
  add(
    "svc_cors_wildcard",
    "CORS does not combine a wildcard origin with credentials",
    corsWildcardCreds ? "FAIL" : "PASS",
    corsWildcardCreds
      ? "CORS is configured with a wildcard origin AND credentials enabled. Browsers reject that combination, so " +
        "the usual workaround is to reflect the request's Origin header — which means any website a logged-in user " +
        "visits can call your API with their cookies attached and read the response."
      : "No wildcard-origin-with-credentials CORS configuration was found.",
  );

  const cookieFlags = /httpOnly:\s*true/i.test(all) && /sameSite/i.test(all);
  const setsCookies = /cookie|session/i.test(all);
  add(
    "svc_session_cookie_flags",
    "Session cookies set HttpOnly, Secure and SameSite",
    !setsCookies ? "SKIPPED" : cookieFlags ? "PASS" : "WARN",
    !setsCookies
      ? "No cookie or session handling was found in the configuration read."
      : cookieFlags
        ? "Cookies are configured with HttpOnly and SameSite."
        : "Session cookie flags (HttpOnly, SameSite) were not found. Without HttpOnly a single XSS reads the session " +
          "token directly; without SameSite the cookie is attached to cross-site requests, which is what CSRF is.",
  );

  const graceful = /SIGTERM|gracefulShutdown|server\.close\(|onShutdown/i.test(ctx.nodeSource + ctx.allConfig);
  add(
    "svc_graceful_shutdown",
    "The service shuts down gracefully",
    graceful ? "PASS" : "WARN",
    graceful
      ? "The service handles SIGTERM, so in-flight requests finish before the process exits."
      : "No SIGTERM handling was found. Every deploy and every autoscaling event then kills the process mid-request, " +
        "so a share of users see a connection reset on each release — usually reported as 'the site glitches when " +
        "you deploy' rather than as an error anyone can reproduce.",
  );

  const health = /\/health|\/healthz|\/readyz|\/_health|actuator\/health/i.test(all + snapshot.paths.join("\n"));
  add(
    "svc_health_endpoint",
    "The service exposes a health endpoint",
    health ? "PASS" : "WARN",
    health
      ? "A health endpoint is present, so the orchestrator and uptime monitoring can distinguish running from working."
      : "No health endpoint was found. Without one, a load balancer routes to a process that has started but cannot " +
        "reach its database, and a rolling deploy of a broken build completes successfully.",
  );

  const structuredLogs = /pino|winston|bunyan|structlog|logback|slf4j|semantic_logger|zap\.|logrus/i.test(
    ctx.packageJson + all,
  );
  add(
    "svc_structured_logging",
    "Logs are structured rather than free text",
    structuredLogs ? "PASS" : "WARN",
    structuredLogs
      ? "A structured logging library is configured, so logs can be queried by field."
      : "No structured logging library was found. console.log output cannot be filtered by request, user or " +
        "severity, so during an incident the logs are a wall of text at exactly the moment they need to be a query.",
  );

  const requestId = /request-?id|correlation-?id|traceparent|x-request-id/i.test(all + ctx.nodeSource);
  add(
    "svc_request_id",
    "Requests carry a correlation id",
    requestId ? "PASS" : "WARN",
    requestId
      ? "Requests carry a correlation id, so one user's journey can be followed across services."
      : "No request correlation id was found. With more than one service, a user's report of 'it failed at 3pm' " +
        "cannot be tied to a specific request chain — every log line has to be matched by timestamp and guesswork.",
  );

  const pool = /pool|POOL_SIZE|CONN_MAX_AGE|HikariCP|max_connections|connectionLimit/i.test(all);
  add(
    "svc_db_connection_pool",
    "Database connections are pooled",
    !/database|DATABASE_URL|datasource/i.test(all) ? "SKIPPED" : pool ? "PASS" : "WARN",
    !/database|DATABASE_URL|datasource/i.test(all)
      ? "No database configuration was read, so pooling does not apply."
      : pool
        ? "Connection pooling is configured."
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
    !/database|DATABASE_URL|datasource/i.test(all) ? "SKIPPED" : migrations ? "PASS" : "WARN",
    !/database|DATABASE_URL|datasource/i.test(all)
      ? "No database configuration was read."
      : migrations
        ? "Schema changes are committed as versioned migrations, so the database can be rebuilt from the repository."
        : "No migration files were found alongside a database configuration. If the schema is changed by hand, " +
          "there is no record of how production got to its current shape and no reliable way to bring a new " +
          "environment to the same state.",
  );

  const envSecrets = /^[A-Z_]*(SECRET|PASSWORD|TOKEN|API_?KEY)[A-Z_]*\s*=\s*(?!$|["']?(your|changeme|xxx|<|\$))[\w./+-]{12,}/m.test(
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
    /(package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|Cargo\.lock)$/i.test(
      p,
    ),
  );
  add(
    "svc_dependency_lockfile",
    "A dependency lockfile is committed",
    lockfile ? "PASS" : "WARN",
    lockfile
      ? "A lockfile is committed, so every environment installs the same dependency versions."
      : "No lockfile is committed. Each install resolves versions afresh, so the build is not reproducible and a " +
        "malicious or broken release of a transitive dependency reaches production without any change here.",
  );

  const errorTracking = /sentry|bugsnag|rollbar|honeybadger|airbrake|datadog|newrelic|opentelemetry/i.test(
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

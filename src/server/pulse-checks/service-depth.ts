// ─────────────────────────────────────────────────────────────────────────────
// SERVICE DEPTH — the five categories with real headroom.
//
// Authentication (25), Observability (25), API Quality (20), Payments (16) and
// Email Deliverability (15) were the thinnest categories that still describe a
// large, genuinely checkable surface. This file deepens those five and only those
// five.
//
// ⚠️ IT DELIBERATELY DOES NOT TOUCH AEO (8), Store Listing (16) or Business
// Operations (15). Those are small because the surface is small — there are about
// eight real answer-engine signals, and inventing more would mean shipping checks
// that measure nothing. A category padded to hit a number is the one thing a
// reviewer reading this catalogue would find, and the uneven sizes are evidence
// the numbers were counted rather than chosen.
//
// Everything here reads repository configuration and source, so it follows the
// same rules as the rest: SKIP when the subject is absent, LOW confidence when the
// sample is too thin for an absence to be evidence, never a FAIL for something
// that was not looked at.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

const SOUND_ABSENCE_COVERAGE = 0.3;

interface Ctx {
  source: string;
  config: string;
  packageJson: string;
  sampled: number;
  total: number;
  coverage: number;
  paths: string[];
}

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const src: string[] = [];
  const cfg: string[] = [];
  let packageJson = "";
  let sampled = 0;

  // Lockfiles enumerate every TRANSITIVE dependency, so a token in one says
  // nothing about the project's own code — yet "jose" in pnpm-lock.yaml (via
  // next-auth) FAILed a repo that verifies no JWTs, "regenerate" in
  // package-lock.json (via Babel) PASSed session rotation on a repo with no
  // sessions, and "pino" in a nested lockfile WARNed a repo with no logger.
  // Tests are not the product either: an e2e axios client is not an outbound
  // call, and expect(login(user)) in a spec is not a log statement.
  const LOCKFILE =
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?|Gemfile\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|composer\.lock|Cargo\.lock|go\.sum|Podfile\.lock|Package\.resolved|pubspec\.lock)$/i;
  const TEST_FILE =
    /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|playwright|cypress)\/|\.(test|spec|e2e)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$|_spec\.rb$/i;
  const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php|go|java|cs)$/i;

  for (const [path, text] of snapshot.files) {
    if (LOCKFILE.test(path)) continue;
    if (SOURCE_FILE.test(path)) {
      if (TEST_FILE.test(path)) continue;
      src.push(text);
      sampled++;
    } else {
      cfg.push(text);
    }
    if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
  }

  const total = snapshot.paths.filter((p) => SOURCE_FILE.test(p) && !TEST_FILE.test(p)).length;

  return {
    source: src.join("\n"),
    config: cfg.join("\n"),
    packageJson,
    sampled,
    total,
    coverage: total === 0 ? 0 : sampled / total,
    paths: snapshot.paths,
  };
}

type Cat = (typeof CATEGORIES)[keyof typeof CATEGORIES];

interface Rule {
  key: string;
  label: string;
  category: Cat;
  /** Does the subject exist at all? When false the check SKIPs with `absent`. */
  applies: (c: Ctx) => boolean;
  /**
   * The coarse subject, for rules whose `applies` is narrowed by a signal in the
   * SAMPLED source (password handling, a comparison, a webhook handler, retry logic).
   * When the coarse subject is present but the narrowing signal was not seen in a thin
   * sample, "not applicable" is not established — the signal may sit in an unread
   * file — so the check is INCONCLUSIVE rather than a confident SKIPPED.
   */
  subject?: (c: Ctx) => boolean;
  /** True when the good thing is present. */
  present: (c: Ctx) => boolean;
  /** Status when `present` is false. */
  onMissing: "WARN" | "FAIL";
  /** Absence findings self-downgrade on a thin sample. */
  absence?: boolean;
  pass: string;
  fail: string;
  absent: string;
}

const has = (re: RegExp) => (c: Ctx) => re.test(c.source + c.config + c.packageJson);
/**
 * Matches SOURCE only.
 *
 * Needed because `has` also reads package.json, and a token as ordinary as
 * "dependencies" appears in every one of them — which made the health-endpoint
 * check pass for every Node project on earth. A unit test caught it; the lesson is
 * that a generic word is not a signal, whatever haystack you search.
 */
const hasInSource = (re: RegExp) => (c: Ctx) => re.test(c.source);

const AUTH = CATEGORIES.AUTHENTICATION;
const OBS = CATEGORIES.OBSERVABILITY;
const API = CATEGORIES.API_QUALITY;
const PAY = CATEGORIES.PAYMENTS;
const MAIL = CATEGORIES.EMAIL;

/** Does this project do authentication at all? */
const doesAuth = has(/passport|next-auth|@auth\/|lucia|clerk|auth0|supabase.*auth|devise|django\.contrib\.auth|spring-security|jsonwebtoken|jose\b|bcrypt|argon2/i);
/** Does it take payments? */
const doesPayments = has(/stripe|paddle|braintree|adyen|square|paypal|lemonsqueezy|chargebee|recurly/i);
/** Does it send email? */
const doesEmail = has(/resend|sendgrid|postmark|mailgun|ses\b|nodemailer|actionmailer|django\.core\.mail|javamail/i);
/** Is it a service with HTTP endpoints? */
const isService = has(/express|fastify|@nestjs|next|django|flask|fastapi|rails|spring|gin-gonic|echo\.New|actix/i);

/** This code checks a password or one-time code itself, rather than handing sign-in to a provider. */
const VERIFIES_CREDENTIAL =
  /\bbcrypt(?:js)?\.compare(?:Sync)?\(|\bargon2\.verify\(|\bverifyPassword\(|\bcomparePassword\(|\bcheck_password(?:_hash)?\(|\bpassword_verify\(|\bauthenticate\(\s*request\b|\bLoginView\b|django\.contrib\.auth\.urls|has_secure_password|\bvalid_password\?|\bdatabase_authenticatable\b|LocalStrategy|CredentialsProvider|\bCredentials\(\s*\{|passwordEncoder\.matches\(|\btotp\.verify\(|\bauthenticator\.(?:check|verify)\(|speakeasy\.totp\.verify|\bverify_?otp\(|\bpyotp\b/i;

/** A constant-time comparison helper, in any of the common languages. */
const CONSTANT_TIME =
  /timingSafeEqual|compare_digest|secure_compare|MessageDigest\.isEqual|ConstantTimeCompare|constant_time_compare|hash_equals\(|safe_str_cmp/i;

/**
 * A plain equality test where one side is named as a credential (a signature, HMAC,
 * API key, webhook or signing secret, or an access/auth/API token) and the other is a
 * value, not a quoted literal or null. `signature.length === x` is not a match, and
 * neither is a bare `token` or `digest`, which tokenizers and content hashes compare.
 */
const CRED_NAME =
  "(?:signature|hmac|secret|api_?key|access_?token|auth_?token|api_?token|bearer_?token|(?:webhook|verify|verification|signing|shared)_?token|x-hub-signature(?:-256)?|x-api-key|x-signature)";
const NAMED = `(?:[\\w$]+(?:\\.[\\w$]+)*\\[\\s*["'\`][\\w-]*${CRED_NAME}["'\`]\\s*\\]|(?<![\\w$])(?:[\\w$]+\\.)*[\\w$]*${CRED_NAME})(?![\\w$.\\[(])`;
const PLAIN = `(?!null\\b|undefined\\b|nil\\b|None\\b|true\\b|false\\b|True\\b|False\\b|\\d)[\\w$]+(?:\\.[\\w$]+|\\[[^\\]\\n]{1,40}\\]|\\(\\))*(?![\\w$.\\[(])`;
const UNSAFE_SECRET_COMPARE = new RegExp(
  `(?<!typeof\\s+)${NAMED}\\s*(?:===?|!==?)\\s*${PLAIN}|(?<![\\w$.])${PLAIN}\\s*(?:===?|!==?)\\s*${NAMED}`,
  "i",
);

const RULES: Rule[] = [
  // ── Authentication ───────────────────────────────────────────────────────
  {
    key: "auth_x_password_hashing_modern", label: "Passwords are hashed with a memory-hard algorithm",
    // Only a project that handles passwords can hash them badly. next-auth with
    // OAuth and magic-link providers only (shadcn-ui/taxonomy) stores none, and was
    // FAILed for "no password hashing library". The password signal covers the
    // common short forms (pwd, passwd) and the credential strategies themselves, so a
    // passport-local strategy comparing `user.pwd === pwd` still applies and FAILs.
    category: AUTH,
    subject: doesAuth,
    applies: (c) =>
      doesAuth(c) &&
      (/pass(?:word|wd|phrase)|\bpwd\b|LocalStrategy|CredentialsProvider/i.test(c.source) ||
        /argon2|bcrypt|scrypt|pbkdf2|password_hash|BCryptPasswordEncoder|\bdevise\b|has_secure_password|django\.contrib\.auth|make_password|PasswordHasher/i.test(
          c.source + c.config + c.packageJson,
        )),
    // Framework auth that hashes by default counts: Devise and has_secure_password
    // use bcrypt, Django's auth uses PBKDF2. Lockfiles are not read, so the
    // transitive bcrypt in Gemfile.lock is not there to vouch for them.
    present: has(/argon2|bcrypt|scrypt|pbkdf2|password_hash|BCryptPasswordEncoder|\bdevise\b|has_secure_password|django\.contrib\.auth|make_password|PasswordHasher/i),
    onMissing: "FAIL", absence: true,
    pass: "Passwords are hashed with a recognised memory-hard or iterated algorithm.",
    fail: "No password hashing library was found alongside the authentication code. A password stored with a plain digest (MD5, SHA-1, or an unsalted SHA-256) is recoverable from a database dump at commodity GPU rates — hours for the whole table, not years.",
    absent: "No password handling was found — authentication, if any, is delegated (OAuth, magic links or a hosted provider).",
  },
  {
    key: "auth_x_session_rotation", label: "The session identifier is rotated on login",
    // Only a server-side session has an identifier to fix. A stateless-JWT API (the
    // realworld example app) has none, and used to PASS on the Babel "regenerate"
    // package in its lockfile. PHP's $_SESSION has no word boundary before
    // "SESSION", so it is listed explicitly.
    category: AUTH,
    subject: doesAuth,
    applies: (c) =>
      doesAuth(c) &&
      /express-session|cookie-session|req\.session|request\.session|\bsession\[|\$_SESSION|session_start\(|iron-session|SessionMiddleware|HttpSession|next-auth|@auth\/|lucia|\bdevise\b|django\.contrib\.(?:auth|sessions)|spring-security/i.test(
        c.source + c.config + c.packageJson,
      ),
    // Frameworks that issue a fresh session at sign-in count: next-auth/Auth.js
    // mints a new session token, Lucia creates a new session, Devise/Warden renews
    // the Rails session, Django's login() calls cycle_key(), and Spring Security
    // migrates the session by default. cal.com and taxonomy (both next-auth) were
    // WARNed for session fixation they cannot have.
    present: has(/regenerate|rotateSession|session\.regenerate|reset_session|newSession|cycleSession|cycle_key|next-auth|@auth\/|lucia|\bdevise\b|django\.contrib\.auth|spring-security/i),
    onMissing: "WARN", absence: true,
    pass: "The session identifier is regenerated at login, explicitly or by the auth framework.",
    fail: "No session rotation was found at the login boundary. If the session id survives authentication, an attacker who can set a victim's cookie before login — through an XSS on a subdomain, or a shared machine — holds a session that becomes authenticated when the victim signs in. This is session fixation, and it is invisible in testing because everything works.",
    absent: "No server-side session was found, so there is no session identifier to rotate.",
  },
  {
    key: "auth_x_token_expiry", label: "Access tokens carry an expiry",
    category: AUTH, applies: has(/jsonwebtoken|jose\b|jwt\.|PyJWT|jjwt/i),
    present: has(/expiresIn|setExpirationTime|\bexp\b\s*[:=]|maxAge|ttl/i),
    onMissing: "WARN", absence: true,
    pass: "Issued tokens set an expiry.",
    fail: "JWTs are issued with no visible expiry. A token without `exp` is valid forever — revoking access then means rotating the signing key and logging out every user at once, which is why it is usually never done.",
    absent: "This project does not issue JWTs.",
  },
  {
    key: "auth_x_jwt_algorithm_pinned", label: "JWT verification pins the algorithm",
    category: AUTH, applies: has(/jsonwebtoken|jose\b|PyJWT|jjwt/i),
    // jsonwebtoken 9 derives the allowed algorithms from the key type and refuses
    // "none" unless it is listed (CVE-2022-23539/23540/23541), and jose's jwtVerify
    // never accepts "none" and binds the algorithm family to the key — so an
    // unpinned verify on either is not the attack this FAIL describes. cal.com
    // (jsonwebtoken 9.0.0, jwt.verify(token, secretKey)) was FAILed for it.
    present: (c) =>
      /algorithms\s*[:=]\s*\[|algorithm\s*[:=]\s*["']|requireAlg|setAllowedAlgorithms|jwtVerify\(/i.test(
        c.source + c.config + c.packageJson,
      ) || /"jsonwebtoken"\s*:\s*"[\^~>=\s]*(?:9|[1-9]\d)(?:\.|")/.test(c.packageJson),
    onMissing: "FAIL", absence: true,
    pass: "Token verification restricts the accepted algorithms — explicitly, or through a library version that derives them from the key.",
    fail: "JWT verification does not pin an algorithm list. A verifier that trusts the token's own `alg` header can be handed `none`, or an HMAC token signed with the public key of an RSA pair — both turn signature verification into a formality.",
    absent: "This project does not verify JWTs.",
  },
  {
    key: "auth_x_login_rate_limit", label: "Authentication endpoints are rate-limited",
    // Credential stuffing needs a sign-in this code CHECKS. The withheld version applied
    // to any repo with an auth library and the word "password" (a profile form, a
    // hosted-provider sign-in widget). It now applies only where this repository
    // verifies a password or one-time code itself; a hosted provider (Clerk, Auth0,
    // Supabase, Firebase, Cognito) rate-limits its own sign-in endpoint.
    category: AUTH, subject: doesAuth,
    applies: (c) => VERIFIES_CREDENTIAL.test(c.source),
    // Named limiters and lockout only: a bare "throttle" is lodash's throttle().
    present: has(/express-rate-limit|rate-limiter-flexible|@upstash\/ratelimit|@nestjs\/throttler|ThrottlerGuard|\brateLimit\(|\brateLimiter\b|@fastify\/rate-limit|express-slow-down|\bslowDown\(|rack-attack|Rack::Attack|django-axes|\baxes\b|django-ratelimit|@ratelimit\(|flask[-_]limiter|\bslowapi\b|\bLimiter\(|throttle:\d|ThrottleRequests|RateLimiter::|:lockable\b|failedAttempts|failed_attempts|lockoutUntil|locked_until|bucket4j/i),
    onMissing: "WARN", absence: true,
    pass: "A rate limiter or account lockout is in use in a project that checks passwords or codes itself. Confirm it covers the sign-in route.",
    fail: "This code checks passwords or one-time codes itself, and no rate limiter or lockout was found. Credential stuffing against a leaked password list is then bounded only by network speed, and it produces no signal that distinguishes it from ordinary traffic.",
    absent: "No password or code check was found in this code: sign-in, if any, is handled by OAuth, magic links or a hosted provider, which rate-limits its own endpoint.",
  },
  {
    key: "auth_x_timing_safe_compare", label: "Secret comparison is timing-safe",
    // Applies only where there is a comparison to judge: a constant-time helper, or an
    // equality test on a CREDENTIAL-named value (a signature, an HMAC, an API key, a
    // webhook or access secret). A bare `token` is too wide: every tokenizer, lexer and
    // CSRF form compares something called a token. The verdict is per comparison seen:
    // one plain `===` on a signature is a WARN even if timingSafeEqual is used elsewhere.
    category: AUTH,
    subject: has(/apiKey|api_key|secret|hmac|signature/i),
    applies: (c) => CONSTANT_TIME.test(c.source + c.config + c.packageJson) || UNSAFE_SECRET_COMPARE.test(c.source),
    present: (c) => !UNSAFE_SECRET_COMPARE.test(c.source),
    onMissing: "WARN",
    pass: "The secret comparisons found use a constant-time function, and no plain equality test on a signature, HMAC, API key or secret was seen.",
    fail: "A signature, HMAC, API key or secret is compared with `===` or an equivalent. String equality returns early at the first differing byte, so response time leaks how much of a guess was correct: enough to recover a webhook signature or an API key byte by byte over a few thousand requests. Use crypto.timingSafeEqual, hmac.compare_digest or secure_compare.",
    absent: "No secret comparison was found in the sampled source.",
  },
  {
    key: "auth_x_mfa_available", label: "A second authentication factor is available",
    category: AUTH, applies: doesAuth, present: has(/totp|otplib|speakeasy|webauthn|passkey|two-?factor|2fa|mfa/i),
    onMissing: "WARN", absence: true,
    pass: "A second factor (TOTP, WebAuthn or passkeys) is implemented.",
    fail: "No second-factor implementation was found. For anything holding customer data this is now the single largest gap between a compromised password and a compromised account.",
    absent: "This project does not appear to implement its own authentication.",
  },
  {
    key: "auth_x_password_reset_token_ttl", label: "Password-reset tokens expire",
    category: AUTH, applies: has(/reset.*password|password.*reset|forgotPassword/i),
    present: has(/expires|ttl|validUntil|maxAge|createdAt/i),
    onMissing: "WARN", absence: true,
    pass: "Password-reset tokens carry an expiry.",
    fail: "The password-reset flow shows no token expiry. A reset link that never expires stays valid in the user's inbox indefinitely, so anyone who later gains access to that mailbox — or to a forwarded message — can take the account.",
    absent: "No password-reset flow was found.",
  },
  {
    key: "auth_x_oauth_state", label: "OAuth flows use a state parameter",
    category: AUTH, applies: has(/oauth|authorize\?|redirect_uri|passport-|next-auth/i),
    present: has(/\bstate\b\s*[:=]|generateState|checks:\s*\[|pkce|code_verifier/i),
    onMissing: "WARN", absence: true,
    pass: "OAuth flows carry a state parameter or PKCE.",
    fail: "No OAuth state parameter or PKCE verifier was found. Without one the callback cannot be tied to the request that started it, so an attacker can complete a flow in a victim's browser and attach their own third-party account to the victim's session.",
    absent: "No OAuth flow was found.",
  },
  {
    key: "auth_x_logout_invalidates", label: "Logout invalidates the session server-side",
    category: AUTH, applies: has(/logout|signOut|sign_out/i),
    present: has(/destroy|invalidate|revoke|delete.*session|blacklist|deleteSession/i),
    onMissing: "WARN", absence: true,
    pass: "Logout destroys or revokes the session on the server.",
    fail: "Logout appears to clear the client's cookie without invalidating anything server-side. The token remains valid, so a copy captured earlier — from a shared machine, a proxy log, or a browser extension — still works after the user believes they have signed out.",
    absent: "No logout path was found.",
  },

  // ── Observability ────────────────────────────────────────────────────────
  {
    key: "obs_x_log_levels", label: "Logging distinguishes severity levels",
    category: OBS, applies: isService, present: has(/logger\.(warn|error|debug|info)|log\.(warn|error|debug)|logging\.(warning|error)|LOG_LEVEL/i),
    onMissing: "WARN", absence: true,
    pass: "Logging uses severity levels, so production noise can be filtered from signal.",
    fail: "No levelled logging was found. Without severity, an incident means reading every line rather than filtering to errors — and there is no way to turn debug output down in production without a code change.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_no_secrets_in_logs", label: "Credentials are not written to logs",
    category: OBS, applies: isService,
    // A logging CALL whose arguments, outside string literals, carry a
    // credential-named value. The old "log[^\n]*password" matched "login",
    // "dialog" and "catalog" anywhere on a line, and the word inside a message
    // ("Common passwords file ... not found"), so discourse and the realworld
    // example FAILed for logging nothing sensitive. Interpolations ($-brace,
    // #-brace, f-string braces) are kept; literal text is not.
    present: (c) =>
      !c.source.split("\n").some((line) => {
        const call =
          /\b(?:console\.(?:log|info|warn|error|debug|trace)|(?:Rails\.)?(?:this\.)?(?:logger|log|logging)\.(?:log|info|warn|warning|error|debug|trace|fatal|critical|exception|print\w*|fatal\w*))\b\s*\(?/i.exec(
            line,
          );
        if (!call) return false;
        // Bounded: a minified bundle is one enormous line, and a log call's arguments are short.
        const rest = line.slice(call.index + call[0].length, call.index + call[0].length + 1000);
        if (/\bheaders?\b[.[\s]*(?:get\s*\(\s*)?["']authorization["']/i.test(rest)) return true;
        const args = rest.replace(
          /(["'\x60])((?:\\.|(?!\1)[^\\])*)\1/g,
          (_m: string, _q: string, body: string) => " " + (body.match(/[$#]?\{[^{}]*\}/g) ?? []).join(" ") + " ",
        );
        // Only the call's own arguments: stop at its closing parenthesis, or at a `;` that
        // ends the statement, so `log("ok"); return token;` is not read as logging a token.
        let depth = 0;
        let end = args.length;
        for (let i = 0; i < args.length; i++) {
          const ch = args[i];
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          else if (ch === ")" || ch === "]" || ch === "}") {
            if (depth === 0) {
              end = i;
              break;
            }
            depth--;
          } else if (ch === ";" && depth === 0) {
            end = i;
            break;
          }
        }
        return /\b\w*?(?:password|passwd|secret|token|api_?key|authorization)\b/i.test(args.slice(0, end));
      }),
    onMissing: "FAIL",
    pass: "No log statement was found writing a credential.",
    fail: "A log statement writes a password, token, secret or authorization header. Logs are the least-protected copy of your data — shipped to third parties, retained long after the data itself, and readable by everyone with dashboard access.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_uncaught_handler", label: "Uncaught exceptions are captured",
    // Node only: crash-on-unhandled-rejection is Node's default. Django/Flask, Go net/http
    // and Spring already confine a request's exception to that request.
    category: OBS, applies: (c) => isService(c) && c.packageJson !== "",
    present: (c) =>
      has(/uncaughtException|unhandledRejection|Sentry\.init\(|sentry_sdk\.init\(/i)(c) ||
      // Next.js registers its own uncaughtException/unhandledRejection listeners (router-server.ts).
      /"next"\s*:/.test(c.packageJson),
    onMissing: "WARN", absence: true,
    pass: "A process-level handler captures uncaught exceptions.",
    fail: "No uncaught-exception handler was found. In Node an unhandled rejection terminates the process by default — so a single unawaited promise takes the service down with nothing written anywhere explaining why.",
    absent: "This does not appear to be a long-running Node service; the unhandled-rejection crash this checks for is Node's default behaviour.",
  },
  {
    key: "obs_x_tracing", label: "Requests are traced across services",
    category: OBS, applies: isService,
    // Source and the project's own package.json, plus zero-code agent wiring in config. Lockfiles
    // list @opentelemetry/api as an optional peer of Next.js, which is not instrumentation, so
    // config only counts launcher, env and manifest-line signals that never appear in a lockfile.
    // Sentry performance tracing counts.
    present: (c) =>
      /opentelemetry|jaeger|zipkin|dd-trace|ddtrace|datadog.*trace|newrelic|traceparent|registerOTel|tracesSampleRate|traces_sample_rate/i.test(c.source) ||
      /"(@opentelemetry\/(sdk-node|sdk-trace-[\w-]+|auto-instrumentations-node)|@vercel\/otel|dd-trace|newrelic)"\s*:/i.test(c.packageJson) ||
      /opentelemetry-instrument\b|opentelemetry-javaagent|ddtrace-run|dd-java-agent|newrelic-admin|OTEL_EXPORTER_OTLP_\w*ENDPOINT|OTEL_TRACES_EXPORTER|DD_TRACE_ENABLED|^(opentelemetry-(sdk|distro)|ddtrace|newrelic)\b|gem\s+['"](ddtrace|datadog|opentelemetry-sdk|newrelic_rpm)['"]/im.test(c.config),
    onMissing: "WARN",
    pass: "Distributed tracing is configured.",
    fail: "No tracing instrumentation was found. With more than one service, 'the checkout was slow' cannot be attributed to a specific hop — you can see that it was slow and not where.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_metrics_endpoint", label: "The service exposes metrics",
    category: OBS, applies: isService,
    // SDK metric calls count as instrumentation: cal.com records
    // metrics.distribution(...) through @sentry/nextjs, which the old pattern missed.
    present: has(/prom-client|prometheus|\/metrics|micrometer|statsd|OpenMetrics|@opentelemetry\/(?:sdk-metrics|api-metrics)|\bmetrics\.(?:increment|distribution|gauge|count|histogram|timing)\(|dd-trace|newrelic/i),
    // A metrics client lives in one bootstrap file; on a thin sample its absence is
    // not established.
    onMissing: "WARN", absence: true,
    pass: "A metrics endpoint or client is configured.",
    fail: "No metrics instrumentation was found. Error tracking tells you what broke; metrics tell you that latency has been climbing for three days. Without them, capacity and degradation are invisible until they become an outage.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_log_retention_config", label: "Log volume is bounded",
    // Only logs this code writes to FILES can fill a disk. Logging to standard output
    // (the default for pino, winston's Console transport, and every container platform)
    // is bounded by the runtime, so it has nothing to rotate. The subject is a file
    // transport or handler, read from the project's own code and config.
    category: OBS,
    subject: has(/winston|pino|bunyan|logging\.config|logback|log4j|structlog|\blogging\.basicConfig/i),
    applies: has(/transports\.File\b|new\s+(?:winston\.)?transports\.File\(|pino\.destination\(\s*["'`][^"'`]+\.log|pino\/file|\bFileHandler\(|RotatingFileHandler|TimedRotatingFileHandler|logging\.basicConfig\([^)]*filename\s*=|FileAppender|RollingFileAppender|logging\.file\.(?:name|path)|\bfilename\s*:\s*["'`][^"'`\n]+\.log["'`]|winston-daily-rotate-file|DailyRotateFile|rotating-file-stream|pino-roll/i),
    present: has(/\bmaxFiles\b|\bmaxsize\b|\bmaxSize\b|winston-daily-rotate-file|DailyRotateFile|rotating-file-stream|pino-roll|RotatingFileHandler|TimedRotatingFileHandler|RollingFileAppender|TimeBasedRollingPolicy|SizeAndTimeBasedRollingPolicy|logging\.logback\.rollingpolicy|max-history|maxHistory|backupCount\s*=|logrotate/i),
    onMissing: "WARN", absence: true,
    pass: "Logs written to files are rotated or capped.",
    fail: "Logs are written to a file with no rotation or size cap. Unbounded log files fill the disk, and a full disk takes down the application and its database together, one of the most common self-inflicted outages there is. Rotate them (a daily-rotate transport, RotatingFileHandler, a rolling appender) or log to standard output.",
    absent: "Logs are not written to files by this code, so the runtime or platform bounds them and there is nothing to rotate.",
  },
  {
    key: "obs_x_startup_config_validation", label: "Configuration is validated at startup",
    category: OBS, applies: isService, present: has(/zod.*env|envalid|createEnv|@t3-oss\/env|joi.*validate.*env|pydantic.*Settings|ConfigurationProperties|required.*env|Missing (required )?env(ironment)?[ _-]?var|ImproperlyConfigured/i),
    onMissing: "WARN", absence: true,
    pass: "Environment configuration is validated at boot.",
    fail: "No startup configuration validation was found. A missing or misspelled environment variable then surfaces as `undefined` deep inside a request — often as a successful call to the wrong place — rather than as a refusal to start.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_dependency_health", label: "Health reporting covers dependencies",
    category: OBS, applies: has(/\/health|\/healthz|\/readyz|actuator\/health/i),
    present: hasInSource(/db\.\w*ping|SELECT 1|redis\.\w*ping|checkDatabase|checkDependencies|readinessProbe/i),
    onMissing: "WARN",
    pass: "The health endpoint checks downstream dependencies.",
    fail: "A health endpoint exists but appears to report only that the process is running. A service that cannot reach its database still answers 200, so the load balancer keeps routing to it and a rolling deploy of a broken build completes successfully.",
    absent: "No health endpoint was found.",
  },

  // ── API quality ──────────────────────────────────────────────────────────
  {
    key: "api_x_input_validation_schema", label: "Request bodies are schema-validated",
    category: API, applies: isService, present: has(/zod|joi|yup|ajv|class-validator|pydantic|marshmallow|jakarta\.validation|@Valid/i),
    onMissing: "WARN", absence: true,
    pass: "Request payloads are validated against a schema.",
    fail: "No schema validation library was found. Hand-written checks tend to cover the fields someone remembered, so the untested shapes — a string where a number was expected, an unexpected extra field, a deeply nested object — reach business logic and the database.",
    absent: "This does not appear to be an HTTP service.",
  },
  {
    key: "api_x_pagination", label: "Collection endpoints are paginated",
    category: API, applies: isService, present: has(/limit|offset|cursor|pageSize|per_page|Pageable|take:|skip:/i),
    onMissing: "WARN",
    pass: "Collection endpoints accept pagination parameters.",
    fail: "No pagination was found on collection endpoints. A list route that returns everything is fine with test data and becomes the slowest query in the system once an account has real volume — usually first noticed as a timeout on the largest customer.",
    absent: "This does not appear to be an HTTP service.",
  },
  {
    key: "api_x_idempotency", label: "State-changing requests can be retried safely",
    // Whole words: "order" matched every CSS "border", and case-folded "POST"
    // matched "post", "postgres" and "Postmark", so a static tutorials site was told
    // it could double-charge. Identifiers still count: createOrder, create_order,
    // OrderService, paymentIntents and stripeClient are how the subject appears in code.
    category: API,
    applies: (c) =>
      // "in order to" / "in charge of" are prose, not an order or a charge.
      /\b(?:stripe|payments?|(?<!\bin\s)charges?|(?<!\bin\s)orders?|bookings?|checkout|purchases?)\b|(?:create|place|submit|cancel|refund|process|confirm)_?(?:order|payment|charge|booking|checkout|purchase)/i.test(
        c.source + c.config + c.packageJson,
      ) ||
      /\b(?:Order|Payment|Charge|Booking|Checkout|Purchase)(?:Service|Controller|Intents?|Repository|Model|Status|Id)\b|\bstripe(?=[A-Z])/.test(
        c.source + c.config + c.packageJson,
      ),
    present: has(/idempotenc|Idempotency-Key|dedupe|requestId.*unique/i),
    // An absence verdict like any other: cal.com keeps its booking idempotency key
    // in packages/lib/idempotencyKey, outside an 80-file sample of ~7,700 files.
    onMissing: "WARN", absence: true,
    pass: "Idempotency handling is present on state-changing operations.",
    fail: "No idempotency mechanism was found. A client that retries after a timeout — which every mobile client does — can create the same order or charge twice, and the duplicate is indistinguishable from a genuine second request.",
    absent: "No state-changing operations were identified.",
  },
  {
    key: "api_x_versioning", label: "The API is versioned",
    category: API, applies: isService, present: has(/\/v[12]\/|api-version|Accept-Version|apiVersion/i),
    onMissing: "WARN",
    pass: "The API carries a version in its path or headers.",
    fail: "No API versioning was found. Any breaking change then has to be coordinated with every consumer simultaneously — which for a mobile client means waiting for store review and for users to update, so in practice the change never happens.",
    absent: "This does not appear to be an HTTP service.",
  },
  {
    key: "api_x_timeout_on_outbound", label: "Outbound calls set a timeout",
    // Source only: "axios" in package.json is a dependency, not a call — the
    // realworld example app's only axios use is its e2e test client.
    category: API, subject: has(/fetch\(|axios|httpx|requests\.|HttpClient|RestTemplate|http\.Get/i),
    applies: hasInSource(/fetch\(|axios|httpx|requests\.|HttpClient|RestTemplate|http\.Get/i),
    present: has(/timeout|AbortSignal|AbortController|setTimeout.*abort|Timeout\(/i),
    onMissing: "WARN", absence: true,
    pass: "Outbound HTTP calls set a timeout.",
    fail: "Outbound HTTP calls were found with no timeout. Python's requests waits indefinitely by default and Node's fetch for up to five minutes, so one slow third party holds every request thread that touches it — the usual mechanism by which a vendor's bad day becomes your outage.",
    absent: "No outbound HTTP calls were found.",
  },
  {
    key: "api_x_retry_backoff", label: "Retries use backoff rather than immediate repetition",
    // Retry LOGIC, not the word: vercel/commerce's only "retry" is a comment saying
    // Shopify retries webhooks, and it was told its retries had no backoff. Loop
    // counters (retries, tries, attempts), Python range(self.retries) and retry
    // helpers count. Code that already shows backoff applies (and passes) on its own.
    category: API,
    subject: has(/retry|retries|maxAttempts/i),
    applies: (c) =>
      /\b(?:max_?retries|max_?attempts|retry_?count|retries_?left|retries|tries|attempts?)\b\s*(?:[<>]=?|[-+]=|\+\+|--)|[<>]=?\s*(?:this\.|self\.)?(?:max_?retries|max_?attempts|retries|tries|attempts?)\b|\b(?:max_?retries|max_?attempts|retries|Retryable|withRetry|retryWhen)\b\s*[:=(]|\bretry_on\b|\bretry\s*\(|range\(\s*(?:self\.)?\w*(?:retries|attempts)\b/i.test(
        c.source,
      ) || /backoff|exponential|jitter|delay.*attempt|Math\.pow.*attempt|p-retry|async-retry/i.test(c.source + c.config + c.packageJson),
    // p-retry and async-retry back off exponentially by default.
    present: has(/backoff|exponential|jitter|delay.*attempt|Math\.pow.*attempt|p-retry|async-retry/i),
    // Absence of backoff on a thin sample is not established: cal.com's retry
    // loops back off with Math.pow(2, retries) in files the sample did not read.
    onMissing: "WARN", absence: true,
    pass: "Retries use backoff.",
    fail: "Retries were found with no backoff. Immediate retries against a struggling dependency multiply the load precisely when it can least take it, turning a brief degradation into a sustained outage that outlives its original cause.",
    absent: "No retry logic was found.",
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  {
    key: "pay_x_webhook_signature", label: "Payment webhooks verify their signature",
    category: PAY, subject: doesPayments,
    // A webhook has to exist (in code read, or in the tree) before its verification can be judged.
    // Provider event names count too: a handler mounted at /stripe/events is still a webhook.
    applies: (c) =>
      doesPayments(c) &&
      (/webhook|checkout\.session\.completed|payment_intent\.succeeded|invoice\.paid|customer\.subscription\.|PAYMENT\.CAPTURE\.COMPLETED|subscription_payment_success/i.test(c.source) ||
        c.paths.some((p) => /webhook/i.test(p))),
    // No bare timingSafeEqual: it is used for API-key and CSRF comparison and says nothing about webhooks.
    // A hand-rolled HMAC check (computing an HMAC and comparing it in constant time — the documented
    // pattern for Lemon Squeezy and Paddle) does count, as do the providers' signature headers.
    present: (c) =>
      has(/constructEvent|verifyWebhook|webhook.*signature|Stripe-Signature|verifyHeader|svix-signature|verify\w*Signature|Paddle-Signature|X-Signature|PayPal-Transmission-Sig|X-Razorpay-Signature|x-paystack-signature|X-Square-Hmacsha256-Signature|X-Hub-Signature/i)(c) ||
      (/createHmac|hmac\.new|OpenSSL::HMAC|Mac\.getInstance/i.test(c.source) &&
        /timingSafeEqual|compare_digest|secure_compare|MessageDigest\.isEqual/i.test(c.source)),
    onMissing: "FAIL", absence: true,
    pass: "Payment webhooks verify the provider's signature before acting.",
    fail: "Webhook handling was found in a project that takes payments, with no signature verification in the code that was read. That endpoint is public by necessity, so anyone who knows the URL can post a forged `payment succeeded` event and receive whatever it grants — the most direct route from a URL to free product there is.",
    absent: "This project does not appear to take payments.",
  },
  {
    key: "pay_x_amount_server_side", label: "Charge amounts are set server-side",
    category: PAY, applies: doesPayments,
    present: (c) => !/amount\s*[:=]\s*(req\.(body|query)|request\.(body|args)|params)\./i.test(c.source),
    onMissing: "FAIL",
    pass: "No charge amount was found being read directly from client input.",
    fail: "A charge amount appears to come straight from the request body. A client that controls the price pays what it likes — and because the payment succeeds, nothing in the provider's dashboard looks wrong.",
    absent: "This project does not appear to take payments.",
  },
  {
    key: "pay_x_no_card_data", label: "Card numbers never reach the server",
    category: PAY, applies: doesPayments,
    present: (c) => !/\b(card_?number|cardNumber|cvv|cvc|pan)\b\s*[:=]/i.test(c.source),
    onMissing: "FAIL",
    pass: "No raw card fields were found in the application's own code.",
    fail: "Raw card fields appear in application code. Handling card numbers directly moves the project from PCI SAQ-A — which a hosted payment form satisfies almost trivially — into a scope most small teams cannot meet, and it puts the most valuable data you could hold into your own logs and database.",
    absent: "This project does not appear to take payments.",
  },
  {
    key: "pay_x_currency_explicit", label: "Amounts carry an explicit currency",
    category: PAY, subject: doesPayments,
    // Only where the code sets an amount itself. Checkout by provider price ID fixes the
    // currency on the provider's Price object, so there is nothing to specify.
    // JS/Go/Ruby `amount:`, Python `amount=`, PHP `'amount' =>`, Java `setAmount(`.
    applies: (c) => doesPayments(c) && /unit_amount|price_data|amount['"]?\s*(:|=>?)|setAmount\(/i.test(c.source),
    // `(?<!con)`: "concurrency" contains "currency", and most CI workflows have a concurrency key.
    present: hasInSource(/(?<!con)currency/i),
    onMissing: "WARN", absence: true,
    pass: "Charges specify a currency.",
    fail: "No currency was found alongside charge amounts. A default currency is an assumption that holds until the first customer in another country, at which point the amount is charged correctly and in the wrong denomination.",
    absent: "No charge amounts are set in this project's own code (it either takes no payments or charges by provider price ID, which fixes the currency on the provider's side).",
  },
  {
    key: "pay_x_minor_units", label: "Money is handled in minor units, not floats",
    category: PAY, applies: doesPayments,
    present: (c) => !/(price|amount|total)\s*[:=]\s*[\d]+\.[\d]{1,2}\b/i.test(c.source) || /(cents|minorUnits|BigDecimal|Decimal|100\s*\*)/i.test(c.source),
    onMissing: "WARN",
    pass: "Money is handled in integer minor units or a decimal type.",
    fail: "Monetary values appear as floating-point literals. Binary floating point cannot represent most decimal fractions exactly, so totals drift by a penny under addition — which reconciliation catches months later and nobody can reproduce.",
    absent: "This project does not appear to take payments.",
  },
  {
    key: "pay_x_subscription_lifecycle", label: "Subscription lifecycle events are handled",
    category: PAY, applies: has(/subscription|recurring|billing_cycle/i),
    present: has(/canceled|cancelled|past_due|payment_failed|invoice\.|subscription\.updated|customer\.subscription/i),
    onMissing: "WARN",
    pass: "Subscription lifecycle events are handled.",
    fail: "Subscriptions are created but the lifecycle events — failed payment, cancellation, dunning — do not appear to be handled. Access then continues after a card stops working, which is revenue lost silently rather than a visible failure.",
    absent: "No subscription billing was found.",
  },

  // ── Email deliverability ─────────────────────────────────────────────────
  {
    key: "mail_x_transactional_provider", label: "Email is sent through a reputable provider",
    category: MAIL, applies: doesEmail, present: has(/resend|sendgrid|postmark|mailgun|ses\b|sparkpost/i),
    onMissing: "WARN",
    pass: "Email is sent through an established transactional provider.",
    fail: "Email appears to be sent through a raw SMTP connection rather than a transactional provider. Self-hosted sending from an application server means the sending IP has no reputation, which is the single largest determinant of whether password-reset mail reaches the inbox.",
    absent: "This project does not appear to send email.",
  },
  {
    key: "mail_x_reply_to_set", label: "Transactional mail sets a reply address",
    category: MAIL, applies: doesEmail, present: has(/reply_?to|replyTo/i),
    onMissing: "WARN",
    pass: "A reply-to address is set.",
    fail: "No reply-to address was found. Replies then go to the sending address — usually a noreply mailbox nobody reads — so a customer answering an email about their own order is talking to nothing.",
    absent: "This project does not appear to send email.",
  },
  {
    key: "mail_x_plaintext_alternative", label: "HTML email carries a plain-text alternative",
    category: MAIL, applies: has(/html:\s*|htmlBody|content_type.*html/i),
    present: has(/text:\s*|textBody|plainText|alt_?text/i),
    onMissing: "WARN",
    pass: "HTML email includes a plain-text part.",
    fail: "HTML email is sent with no plain-text alternative. Spam filters treat HTML-only mail as a negative signal, and it renders as an empty message in clients with images and HTML disabled.",
    absent: "No HTML email was found.",
  },
  {
    key: "mail_x_unsubscribe_header", label: "Bulk mail carries a one-click unsubscribe",
    category: MAIL, applies: has(/newsletter|campaign|broadcast|marketing.*email|bulk/i),
    present: has(/List-Unsubscribe|unsubscribe/i),
    onMissing: "WARN",
    pass: "An unsubscribe path is present for bulk mail.",
    fail: "Bulk email is sent with no List-Unsubscribe header. Gmail and Yahoo have required one-click unsubscribe for bulk senders since 2024 — without it, delivery to those providers degrades for every message you send, including transactional ones.",
    absent: "No bulk or marketing email was found.",
  },
  {
    key: "mail_x_bounce_handling", label: "Bounces and complaints are handled",
    category: MAIL, applies: doesEmail, present: has(/bounce|complaint|suppression|delivery_?status|webhook.*email/i),
    onMissing: "WARN",
    pass: "Bounce or complaint handling is present.",
    fail: "No bounce or complaint handling was found. Continuing to send to addresses that hard-bounce is the fastest way to lose sender reputation, and it is invisible from inside the application — the send call succeeds every time.",
    absent: "This project does not appear to send email.",
  },
  {
    key: "mail_x_template_escaping", label: "Email templates escape user content",
    category: MAIL, applies: has(/html:\s*`|htmlBody|renderEmail|email.*template/i),
    present: has(/escapeHtml|sanitize|\{\{[^!]|autoescape|escape\(/i),
    onMissing: "WARN", absence: true,
    pass: "Email templates escape interpolated content.",
    fail: "Email HTML appears to interpolate values without escaping. A display name containing markup then breaks the layout for every recipient, and in a shared-inbox client can be used to spoof the rest of the message.",
    absent: "No email templates were found.",
  },
];

export const SERVICE_DEPTH_KEYS: string[] = RULES.map((r) => r.key);

/** Registry rows, so the catalogue is generated from the same table the checks are. */
export const SERVICE_DEPTH_REGISTRY = RULES.map((r) => ({
  key: r.key,
  category: r.category,
  label: r.label,
}));

export function evaluateServiceDepthChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const soundAbsence = ctx.coverage >= SOUND_ABSENCE_COVERAGE;

  return RULES.map((rule): PulseScanCheckInput => {
    if (!rule.applies(ctx)) {
      if (rule.subject && !soundAbsence && rule.subject(ctx)) {
        return {
          category: rule.category,
          checkKey: rule.key,
          label: rule.label,
          status: "INCONCLUSIVE",
          confidence: "LOW",
          confidenceReason:
            `Only ${ctx.sampled} of ${ctx.total} source files were read, so whether this check applies is not ` +
            "established.",
          detail:
            `The code this check grades was not found in the ${ctx.sampled} of ${ctx.total} source files read. That ` +
            "is too few to establish that it is absent, so this check is inconclusive rather than not applicable.",
        };
      }
      return {
        category: rule.category,
        checkKey: rule.key,
        label: rule.label,
        status: "SKIPPED",
        confidence: "HIGH",
        detail: rule.absent,
      };
    }
    const ok = rule.present(ctx);
    const weak = !ok && rule.absence === true && !soundAbsence;
    return {
      category: rule.category,
      checkKey: rule.key,
      label: rule.label,
      status: ok ? "PASS" : rule.onMissing,
      confidence: weak ? "LOW" : "HIGH",
      ...(weak
        ? {
            confidenceReason:
              `Only ${ctx.sampled} of ${ctx.total} source files were read, so the absence of this pattern is not ` +
              "established.",
          }
        : {}),
      detail: ok ? rule.pass : rule.fail,
    };
  });
}

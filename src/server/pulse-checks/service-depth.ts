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

  for (const [path, text] of snapshot.files) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php|go|java|cs)$/i.test(path)) {
      src.push(text);
      sampled++;
    } else {
      cfg.push(text);
    }
    if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
  }

  const total = snapshot.paths.filter((p) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php|go|java|cs)$/i.test(p),
  ).length;

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

const RULES: Rule[] = [
  // ── Authentication ───────────────────────────────────────────────────────
  {
    key: "auth_x_password_hashing_modern", label: "Passwords are hashed with a memory-hard algorithm",
    category: AUTH, applies: doesAuth, present: has(/argon2|bcrypt|scrypt|pbkdf2|password_hash|BCryptPasswordEncoder/i),
    onMissing: "FAIL", absence: true,
    pass: "Passwords are hashed with a recognised memory-hard or iterated algorithm.",
    fail: "No password hashing library was found alongside the authentication code. A password stored with a plain digest (MD5, SHA-1, or an unsalted SHA-256) is recoverable from a database dump at commodity GPU rates — hours for the whole table, not years.",
    absent: "This project does not appear to implement its own authentication.",
  },
  {
    key: "auth_x_session_rotation", label: "The session identifier is rotated on login",
    category: AUTH, applies: doesAuth, present: has(/regenerate|rotateSession|session\.regenerate|reset_session|newSession|cycleSession/i),
    onMissing: "WARN", absence: true,
    pass: "The session identifier is regenerated at login.",
    fail: "No session rotation was found at the login boundary. If the session id survives authentication, an attacker who can set a victim's cookie before login — through an XSS on a subdomain, or a shared machine — holds a session that becomes authenticated when the victim signs in. This is session fixation, and it is invisible in testing because everything works.",
    absent: "This project does not appear to implement its own authentication.",
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
    present: has(/algorithms\s*[:=]\s*\[|algorithm\s*[:=]\s*["']|requireAlg|setAllowedAlgorithms/i),
    onMissing: "FAIL", absence: true,
    pass: "Token verification names the algorithms it will accept.",
    fail: "JWT verification does not pin an algorithm list. A verifier that trusts the token's own `alg` header can be handed `none`, or an HMAC token signed with the public key of an RSA pair — both turn signature verification into a formality.",
    absent: "This project does not verify JWTs.",
  },
  {
    key: "auth_x_login_rate_limit", label: "Authentication endpoints are rate-limited",
    category: AUTH, applies: doesAuth, present: has(/rate-?limit|rateLimiter|throttle|attempt.*lock|failedAttempts|slowDown/i),
    onMissing: "WARN", absence: true,
    pass: "Rate limiting or lockout is applied around authentication.",
    fail: "No rate limiting or lockout was found around the login path. Credential stuffing against a leaked password list is then bounded only by network speed, and it produces no signal that distinguishes it from ordinary traffic.",
    absent: "This project does not appear to implement its own authentication.",
  },
  {
    key: "auth_x_timing_safe_compare", label: "Secret comparison is timing-safe",
    category: AUTH, applies: has(/apiKey|api_key|token|secret|hmac|signature/i),
    present: has(/timingSafeEqual|hmac\.compare_digest|compare_digest|secure_compare|MessageDigest\.isEqual|subtle\.timingSafeEqual/i),
    onMissing: "WARN", absence: true,
    pass: "Secrets are compared with a constant-time function.",
    fail: "Secrets appear to be compared with `===` or an equivalent. String equality returns early at the first differing byte, so response time leaks how much of a guess was correct — enough to recover an API key or a webhook signature byte by byte over a few thousand requests.",
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
    present: (c) => !/log[^\n]*\b(password|secret|token|apiKey|api_key|authorization)\b/i.test(c.source),
    onMissing: "FAIL",
    pass: "No log statement was found writing a credential.",
    fail: "A log statement writes a password, token, secret or authorization header. Logs are the least-protected copy of your data — shipped to third parties, retained long after the data itself, and readable by everyone with dashboard access.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_uncaught_handler", label: "Uncaught exceptions are captured",
    category: OBS, applies: isService, present: has(/uncaughtException|unhandledRejection|sys\.excepthook|Thread\.setDefaultUncaughtExceptionHandler|recover\(\)/i),
    onMissing: "WARN", absence: true,
    pass: "A process-level handler captures uncaught exceptions.",
    fail: "No uncaught-exception handler was found. In Node an unhandled rejection terminates the process by default — so a single unawaited promise takes the service down with nothing written anywhere explaining why.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_tracing", label: "Requests are traced across services",
    category: OBS, applies: isService, present: has(/opentelemetry|@opentelemetry|jaeger|zipkin|datadog.*trace|newrelic|traceparent/i),
    onMissing: "WARN",
    pass: "Distributed tracing is configured.",
    fail: "No tracing instrumentation was found. With more than one service, 'the checkout was slow' cannot be attributed to a specific hop — you can see that it was slow and not where.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_metrics_endpoint", label: "The service exposes metrics",
    category: OBS, applies: isService, present: has(/prom-client|prometheus|\/metrics|micrometer|statsd|OpenMetrics/i),
    onMissing: "WARN",
    pass: "A metrics endpoint or client is configured.",
    fail: "No metrics instrumentation was found. Error tracking tells you what broke; metrics tell you that latency has been climbing for three days. Without them, capacity and degradation are invisible until they become an outage.",
    absent: "This does not appear to be a long-running service.",
  },
  {
    key: "obs_x_log_retention_config", label: "Log volume is bounded",
    category: OBS, applies: has(/winston|pino|bunyan|logging\.config|logback/i),
    present: has(/maxFiles|maxSize|rotat|retention|RollingFile|TimeBasedTriggering/i),
    onMissing: "WARN",
    pass: "Log rotation or retention is configured.",
    fail: "A logging library is configured with no rotation or retention limit. Unbounded logs fill the disk, and a full disk takes down the application and its database together — one of the most common self-inflicted outages there is.",
    absent: "No configurable logging library was found.",
  },
  {
    key: "obs_x_startup_config_validation", label: "Configuration is validated at startup",
    category: OBS, applies: isService, present: has(/zod.*env|envalid|joi.*validate.*env|pydantic.*Settings|ConfigurationProperties|required.*env/i),
    onMissing: "WARN",
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
    category: API, applies: has(/stripe|payment|charge|order|booking|POST/i),
    present: has(/idempotenc|Idempotency-Key|dedupe|requestId.*unique/i),
    onMissing: "WARN",
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
    category: API, applies: has(/fetch\(|axios|httpx|requests\.|HttpClient|RestTemplate|http\.Get/i),
    present: has(/timeout|AbortSignal|AbortController|setTimeout.*abort|Timeout\(/i),
    onMissing: "WARN", absence: true,
    pass: "Outbound HTTP calls set a timeout.",
    fail: "Outbound HTTP calls were found with no timeout. Node's fetch and Python's requests both wait indefinitely by default, so one slow third party holds every request thread that touches it — the usual mechanism by which a vendor's bad day becomes your outage.",
    absent: "No outbound HTTP calls were found.",
  },
  {
    key: "api_x_retry_backoff", label: "Retries use backoff rather than immediate repetition",
    category: API, applies: has(/retry|retries|maxAttempts/i),
    present: has(/backoff|exponential|jitter|delay.*attempt|Math\.pow.*attempt/i),
    onMissing: "WARN",
    pass: "Retries use backoff.",
    fail: "Retries were found with no backoff. Immediate retries against a struggling dependency multiply the load precisely when it can least take it, turning a brief degradation into a sustained outage that outlives its original cause.",
    absent: "No retry logic was found.",
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  {
    key: "pay_x_webhook_signature", label: "Payment webhooks verify their signature",
    category: PAY, applies: doesPayments, present: has(/constructEvent|verifyWebhook|webhook.*signature|Stripe-Signature|verifyHeader/i),
    onMissing: "FAIL", absence: true,
    pass: "Payment webhooks verify the provider's signature before acting.",
    fail: "A payment webhook endpoint was found with no signature verification. That endpoint is public by necessity, so anyone who knows the URL can post a forged `payment succeeded` event and receive whatever it grants — the most direct route from a URL to free product there is.",
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
    category: PAY, applies: doesPayments, present: has(/currency/i),
    onMissing: "WARN",
    pass: "Charges specify a currency.",
    fail: "No currency was found alongside charge amounts. A default currency is an assumption that holds until the first customer in another country, at which point the amount is charged correctly and in the wrong denomination.",
    absent: "This project does not appear to take payments.",
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

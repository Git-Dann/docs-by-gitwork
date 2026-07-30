// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL DEPTH — evidence-backed controls for the categories where source
// and configuration can answer materially different questions.
//
// Every rule has:
//   • a subject trigger, so irrelevant projects SKIP rather than fail;
//   • positive and adverse fixtures, exercised for every rule in CI;
//   • required and/or forbidden evidence;
//   • an actionable remediation, never a bare "missing";
//   • LOW-confidence handling when an absence is inferred from a thin sample.
//
// The rules intentionally do not inflate categories whose surface cannot support
// more independent controls. A skipped rule is still useful catalogue coverage,
// but it is never allowed to alter the score.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES, type CheckCategory } from "./categories";
import type { RepoSnapshot } from "./native-mobile";

const SOUND_ABSENCE_COVERAGE = 0.3;

export interface OperationalDepthRule {
  key: string;
  label: string;
  category: CheckCategory;
  subject: RegExp;
  required?: RegExp[];
  forbidden?: RegExp[];
  onMissing: "WARN" | "FAIL";
  remediation: string;
  positiveFixture: string;
  adverseFixture: string;
}

const rule = (
  category: CheckCategory,
  key: string,
  label: string,
  subject: RegExp,
  required: RegExp[] | undefined,
  forbidden: RegExp[] | undefined,
  onMissing: "WARN" | "FAIL",
  remediation: string,
  positiveFixture: string,
  adverseFixture: string,
): OperationalDepthRule => ({
  category,
  key,
  label,
  subject,
  required,
  forbidden,
  onMissing,
  remediation,
  positiveFixture,
  adverseFixture,
});

const AUTH = CATEGORIES.AUTHENTICATION;
const ROLES = CATEGORIES.ROLES;
const OBS = CATEGORIES.OBSERVABILITY;
const API = CATEGORIES.API_QUALITY;
const PAY = CATEGORIES.PAYMENTS;
const MAIL = CATEGORIES.EMAIL;
const INFRA = CATEGORIES.INFRASTRUCTURE;
const PERF = CATEGORIES.PERFORMANCE;
const AI = CATEGORIES.AI_SAFETY;
const VIBE = CATEGORIES.VIBE_HYGIENE;
const BUSINESS = CATEGORIES.BUSINESS_OPS;
const SAAS = CATEGORIES.SAAS;
const LEGAL = CATEGORIES.LEGAL;
const GLOBAL = CATEGORIES.GLOBAL_DISTRIBUTION;
const PAGES = CATEGORIES.MISSING_PAGES;

export const OPERATIONAL_DEPTH_RULES: OperationalDepthRule[] = [
  // ── Authentication ───────────────────────────────────────────────────────
  rule(
    AUTH, "auth_depth_session_cookie_flags", "Session cookies enforce Secure, HttpOnly and SameSite",
    /express-session|cookie-session|session\s*\(|set-cookie/i,
    [/secure\s*:\s*true|Secure\b/i, /httpOnly\s*:\s*true|HttpOnly\b/i, /sameSite\s*:\s*["']?(?:lax|strict|none)|SameSite=/i],
    [/secure\s*:\s*false|httpOnly\s*:\s*false/i], "FAIL",
    "Set Secure and HttpOnly, choose an explicit SameSite policy, and test the production Set-Cookie header.",
    `app.use(session({ cookie: { secure: true, httpOnly: true, sameSite: "lax" } }));`,
    `app.use(session({ cookie: { secure: false } }));`,
  ),
  rule(
    AUTH, "auth_depth_csrf_state_change", "Cookie-authenticated state changes carry CSRF protection",
    /app\.(?:post|put|patch|delete)|router\.(?:post|put|patch|delete)|cookie-session|express-session/i,
    [/\bcsrf\b|xsrf|sameSite\s*:\s*["']strict|double.?submit/i], undefined, "WARN",
    "Add framework CSRF middleware or a verified double-submit token to every cookie-authenticated mutation.",
    `app.use(session({ cookie: { sameSite: "strict" } })); app.post("/profile", csrfProtection, update);`,
    `app.use(session({})); app.post("/profile", update);`,
  ),
  rule(
    AUTH, "auth_depth_sensitive_reauthentication", "Sensitive account changes require recent authentication",
    /change.{0,20}(?:password|email)|delete.{0,20}account|payout|transfer.{0,20}ownership/i,
    [/reauth|currentPassword|recentAuth|auth_time|step.?up/i], undefined, "WARN",
    "Require the current credential or a recent step-up challenge before changing identity, ownership, payout, or recovery data.",
    `router.post("/change-email", requireRecentAuth, changeEmail);`,
    `router.post("/change-email", changeEmail);`,
  ),
  rule(
    AUTH, "auth_depth_generic_login_errors", "Login responses do not reveal whether an account exists",
    /login|signIn|authenticate/i,
    [/invalid (?:credentials|email or password)|authentication failed/i],
    [/(?:user|account|email) (?:not found|does not exist)|wrong password/i], "WARN",
    "Return the same status, message, and timing for an unknown account and a wrong password.",
    `return response.status(401).json({ error: "Invalid credentials" }); // login`,
    `return response.status(404).json({ error: "User not found" }); // login`,
  ),
  rule(
    AUTH, "auth_depth_recovery_single_use", "Account-recovery tokens are invalidated after use",
    /password.?reset|resetPassword|recovery.?token|resetToken/i,
    [/usedAt|consumedAt|deleteMany|invalidate|single.?use/i], undefined, "WARN",
    "Consume recovery tokens transactionally and reject every subsequent use, including concurrent requests.",
    `await db.transaction([resetPassword(), token.update({ data: { usedAt: new Date() } })]);`,
    `await resetPassword(recoveryToken);`,
  ),
  rule(
    AUTH, "auth_depth_session_absolute_expiry", "Sessions have an absolute lifetime as well as idle expiry",
    /express-session|cookie-session|createSession|sessionToken/i,
    [/absoluteExpir|maxAge|expiresAt|sessionLifetime/i], undefined, "WARN",
    "Set a finite absolute session lifetime so continuous activity cannot keep a stolen session alive forever.",
    `createSession({ expiresAt: addHours(now, 12), maxAge: 43200 });`,
    `createSession({ rolling: true });`,
  ),
  rule(
    AUTH, "auth_depth_admin_step_up", "Administrative actions require step-up authentication",
    /\/admin|adminRouter|requireAdmin|role\s*===?\s*["']admin/i,
    [/requireMfa|stepUp|recentAuth|acr_values|auth_time/i], undefined, "WARN",
    "Require a fresh MFA or passkey assertion for destructive admin actions, not only the original login.",
    `adminRouter.delete("/users/:id", requireAdmin, requireMfa, deleteUser);`,
    `adminRouter.delete("/users/:id", requireAdmin, deleteUser);`,
  ),
  rule(
    AUTH, "auth_depth_oauth_redirect_allowlist", "OAuth return URLs are constrained to an allow-list",
    /redirect_uri|callbackUrl|returnTo|oauth.{0,20}callback/i,
    [/allowedRedirect|safeRedirect|redirectAllowlist|new URL\([^)]*,\s*(?:APP_URL|baseUrl)/i],
    [/res\.redirect\(\s*(?:req|request)\.(?:query|body)|redirect\(\s*callbackUrl\s*\)/i], "FAIL",
    "Resolve return paths against the product origin and reject absolute or unlisted callback destinations.",
    `const target = safeRedirect(callbackUrl, redirectAllowlist); res.redirect(target);`,
    `const callbackUrl = req.query.callbackUrl; res.redirect(callbackUrl);`,
  ),

  // ── Roles & permissions ──────────────────────────────────────────────────
  rule(
    ROLES, "roles_depth_server_authorization", "Privileged routes enforce authorization on the server",
    /admin|permission|role|privileged/i,
    [/authorize\(|requireRole|requirePermission|can\(|policy\./i], undefined, "FAIL",
    "Enforce authorization inside the server handler or policy layer; hidden UI controls are not access control.",
    `router.delete("/admin/users/:id", requirePermission("users:delete"), handler);`,
    `router.delete("/admin/users/:id", handler); // button is hidden for non-admins`,
  ),
  rule(
    ROLES, "roles_depth_default_deny", "Authorization policies default to deny",
    /authorization|permission|policy|access control/i,
    [/default.{0,12}deny|deny.{0,12}default|return false|effect\s*:\s*["']Deny/i],
    [/default.{0,12}allow|return true\s*;?\s*\/\/ fallback/i], "FAIL",
    "Make unknown roles, resources, and actions deny by default and add explicit grants.",
    `function can(action) { if (!known(action)) return false; } // authorization default deny`,
    `function can(action) { return true; } // authorization default allow fallback`,
  ),
  rule(
    ROLES, "roles_depth_tenant_query_scope", "Multi-tenant data queries carry tenant scope",
    /workspaceId|tenantId|organizationId|accountId/i,
    [/where\s*:\s*\{[^}]{0,160}(?:workspaceId|tenantId|organizationId|accountId)|scopeToTenant|tenantFilter/i],
    undefined, "FAIL",
    "Inject the authenticated tenant identifier into every query rather than accepting it from the request body.",
    `db.document.findMany({ where: { workspaceId: session.workspaceId } });`,
    `const workspaceId = req.body.workspaceId; db.document.findMany();`,
  ),
  rule(
    ROLES, "roles_depth_object_ownership", "Object-level access verifies ownership or membership",
    /findUnique|findById|\/:[a-z]*id|params\.id/i,
    [/ownerId|userId.{0,30}(?:===|where)|membership|authorizeObject|scopeToUser/i], undefined, "FAIL",
    "Check the requested object's owner or tenant membership before returning or mutating it.",
    `const item = await db.item.findFirst({ where: { id: params.id, ownerId: session.user.id } });`,
    `const item = await db.item.findUnique({ where: { id: params.id } });`,
  ),
  rule(
    ROLES, "roles_depth_role_change_audit", "Role and permission changes create audit events",
    /updateRole|changeRole|setPermissions|grantPermission|revokePermission/i,
    [/audit|securityEvent|activityLog|recordEvent/i], undefined, "WARN",
    "Record actor, target, before/after grants, reason, and timestamp for every authorization change.",
    `await updateRole(userId, role); await audit.recordEvent("role.changed", { actor, userId, role });`,
    `await updateRole(userId, role);`,
  ),
  rule(
    ROLES, "roles_depth_impersonation_control", "Support impersonation is explicit, bounded and audited",
    /impersonat|loginAs|actAsUser/i,
    [/audit|reason|requiredTicket|expiresAt|stopImpersonat/i], undefined, "FAIL",
    "Require a support reason, short expiry, visible session state, and immutable audit event for impersonation.",
    `impersonate({ target, reason, expiresAt }); audit.record("impersonation.started");`,
    `loginAsUser(targetUserId);`,
  ),
  rule(
    ROLES, "roles_depth_service_account_scope", "Service accounts and API tokens carry explicit scopes",
    /service.?account|api.?token|personal.?access.?token/i,
    [/scopes?\s*[:=]|permissions?\s*[:=]|allowedActions/i], undefined, "WARN",
    "Issue narrowly-scoped machine credentials and validate their scope at each protected operation.",
    `createServiceAccount({ scopes: ["invoices:read"] });`,
    `createServiceAccount({ name: "automation" });`,
  ),
  rule(
    ROLES, "roles_depth_permission_contract_tests", "Authorization boundaries have executable tests",
    /requireRole|requirePermission|authorize\(|policy\./i,
    [/describe\([^)]*(?:permission|authoriz|role)|it\([^)]*(?:forbid|deny|permission)|expect\([^)]*403/i],
    undefined, "WARN",
    "Add allow and deny tests for every role/resource boundary, including cross-tenant identifiers.",
    `requirePermission("billing:write"); describe("authorization", () => it("denies viewer", () => expect(status).toBe(403)));`,
    `requirePermission("billing:write");`,
  ),

  // ── Observability ────────────────────────────────────────────────────────
  rule(
    OBS, "obs_depth_structured_redaction", "Structured logs redact secrets and personal data",
    /pino|winston|structlog|logger\./i,
    [/redact\s*[:=]|sanitizeLog|maskSensitive|filterSensitive/i],
    [/logger\.\w+\([^)]*(?:password|authorization|accessToken|refreshToken)/i], "FAIL",
    "Configure central field redaction for credentials, cookies, tokens, and high-risk personal data before log export.",
    `const logger = pino({ redact: ["req.headers.authorization", "password"] });`,
    `logger.info({ password, accessToken }, "login");`,
  ),
  rule(
    OBS, "obs_depth_trace_sampling", "Distributed tracing has an explicit sampling policy",
    /opentelemetry|TracerProvider|traceparent|datadog.{0,12}trace/i,
    [/sampler|sampleRate|tracesSampleRate|parentBased|traceIdRatio/i], undefined, "WARN",
    "Set head or tail sampling deliberately and retain errors and high-latency traces at a higher rate.",
    `new TracerProvider({ sampler: new ParentBasedSampler({ root: ratioSampler }) });`,
    `new TracerProvider(); // opentelemetry defaults only`,
  ),
  rule(
    OBS, "obs_depth_latency_histogram", "Request latency is measured as a distribution",
    /prom-client|prometheus|metrics|micrometer|Histogram/i,
    [/Histogram|Timer\.builder|request_duration|latency_bucket/i], undefined, "WARN",
    "Record request duration in histogram buckets so p50/p95/p99 latency and SLO burn are measurable.",
    `const requestDuration = new Histogram({ name: "http_request_duration_seconds" });`,
    `metrics.increment("http_requests_total");`,
  ),
  rule(
    OBS, "obs_depth_slo_versioned", "Service-level objectives are version-controlled",
    /service|api|server|availability/i,
    [/\bSLO\b|service.?level.?objective|error.?budget|burn.?rate/i], undefined, "WARN",
    "Version an availability/latency objective with its measurement window and alert on fast and slow burn.",
    `service: api\nSLO: 99.9% availability\nerror_budget: 43m\nburn_rate_alert: true`,
    `service: api\nmonitoring: enabled`,
  ),
  rule(
    OBS, "obs_depth_release_markers", "Telemetry identifies the deployed release",
    /sentry|datadog|newrelic|opentelemetry|telemetry/i,
    [/release\s*[:=]|service\.version|deployment\.environment|SENTRY_RELEASE|git\.sha/i], undefined, "WARN",
    "Attach immutable release and environment identifiers to errors, logs, metrics, and traces.",
    `Sentry.init({ release: process.env.GIT_SHA, environment: process.env.DEPLOY_ENV });`,
    `Sentry.init({ dsn: process.env.SENTRY_DSN });`,
  ),
  rule(
    OBS, "obs_depth_queue_metrics", "Queue depth, age and consumer lag are monitored",
    /bullmq|rabbitmq|kafka|sqs|celery|sidekiq/i,
    [/queue.{0,16}(?:depth|age)|consumer.?lag|oldest.?message|jobs_waiting/i], undefined, "WARN",
    "Alert on queue depth, oldest-message age, failed jobs, and consumer lag before work silently backs up.",
    `metrics.gauge("queue_depth", queue.waiting); metrics.gauge("oldest_message_age", age); // bullmq`,
    `const queue = new Queue("email"); // bullmq`,
  ),
  rule(
    OBS, "obs_depth_slow_query_visibility", "Database query latency and slow queries are visible",
    /prisma|sequelize|typeorm|sqlalchemy|hibernate|database/i,
    [/slow.?quer|query.{0,12}duration|log_min_duration_statement|statement_timeout|db\.client\.operation\.duration/i],
    undefined, "WARN",
    "Capture query duration, identify the operation safely, and alert on slow-query rate without logging bound values.",
    `prisma.$on("query", e => metrics.histogram("query_duration", e.duration)); // slow query`,
    `const prisma = new PrismaClient();`,
  ),
  rule(
    OBS, "obs_depth_utc_timestamps", "Operational events use unambiguous UTC timestamps",
    /logger\.|audit|telemetry|event/i,
    [/toISOString\(|DateTime\.utc|timezone\s*[:=]\s*["']UTC|timestamp.{0,12}UTC/i], undefined, "WARN",
    "Emit ISO-8601 UTC timestamps and preserve a separate user timezone only for presentation.",
    `logger.info({ timestamp: new Date().toISOString(), event: "started" });`,
    `logger.info({ timestamp: new Date().toLocaleString(), event: "started" });`,
  ),

  // ── API quality ──────────────────────────────────────────────────────────
  rule(
    API, "api_depth_response_schema", "API responses are validated against a schema",
    /app\.(?:get|post|put|patch|delete)|router\.|NextResponse|FastAPI|Controller/i,
    [/responseSchema|safeParse\(response|serialize\(|response_model|OpenAPI.{0,20}responses/i], undefined, "WARN",
    "Validate or serialize responses at the boundary so undocumented fields and invalid shapes cannot leak to clients.",
    `router.get("/users", { schema: { response: responseSchema } }, handler);`,
    `router.get("/users", async () => db.user.findMany());`,
  ),
  rule(
    API, "api_depth_page_size_cap", "Pagination enforces a maximum page size",
    /pageSize|per_page|limit|take\s*:/i,
    [/Math\.min\(|MAX_PAGE|maximum.{0,12}page|\.max\(\s*\d+\s*\)|le\s*=\s*\d+/i], undefined, "WARN",
    "Clamp client-requested page sizes to a documented upper bound before building the database query.",
    `const take = Math.min(Number(req.query.pageSize ?? 20), MAX_PAGE_SIZE);`,
    `const take = Number(req.query.pageSize);`,
  ),
  rule(
    API, "api_depth_cursor_validation", "Pagination cursors are opaque and validated",
    /cursor/i,
    [/verifyCursor|decodeCursor|cursorSchema|safeParse\(cursor|HMAC.{0,20}cursor/i], undefined, "WARN",
    "Decode and validate an opaque cursor; sign it when it contains authorization-sensitive state.",
    `const value = cursorSchema.parse(decodeCursor(req.query.cursor));`,
    `const value = JSON.parse(Buffer.from(req.query.cursor, "base64").toString());`,
  ),
  rule(
    API, "api_depth_conditional_requests", "Read endpoints support conditional requests",
    /app\.get|router\.get|GET\s+\/|cacheable/i,
    [/\bETag\b|If-None-Match|Last-Modified|If-Modified-Since/i], undefined, "WARN",
    "Return ETag or Last-Modified validators and honour conditional requests with 304 responses.",
    `router.get("/catalog", (req, res) => res.set("ETag", digest).send(body));`,
    `router.get("/catalog", (req, res) => res.json(body));`,
  ),
  rule(
    API, "api_depth_request_deadline", "Inbound requests have a bounded execution deadline",
    /app\.use|server\.use|middleware|request/i,
    [/requestTimeout|AbortSignal\.timeout|deadline|timeoutMiddleware|server\.timeout/i], undefined, "WARN",
    "Apply a server-side request deadline and propagate cancellation to database and downstream calls.",
    `app.use(timeoutMiddleware(10_000)); const signal = AbortSignal.timeout(9000);`,
    `app.use(requestLogger);`,
  ),
  rule(
    API, "api_depth_webhook_replay_window", "Webhook verification rejects stale deliveries",
    /webhook/i,
    [/tolerance|timestamp.{0,24}(?:window|age|fresh)|replay|nonce/i], undefined, "FAIL",
    "Verify the signed timestamp within a short tolerance and persist event identifiers to reject replays.",
    `verifyWebhook(signature, body, { tolerance: 300 }); rejectReplay(event.id);`,
    `verifyWebhook(signature, body); processWebhook(body);`,
  ),
  rule(
    API, "api_depth_idempotency_persisted", "Idempotency keys are persisted atomically",
    /Idempotency-Key|idempotencyKey|idempotency|idempotent/i,
    [/unique\s*\(|SETNX|upsert\(|insertOrIgnore|transaction.{0,40}idempoten/i], undefined, "WARN",
    "Store the key and response under a unique constraint in the same transaction as the side effect.",
    `await db.transaction(() => idempotency.upsert({ where: { key }, create: result })); // unique(key)`,
    `const key = req.header("Idempotency-Key"); if (memoryCache.has(key)) return;`,
  ),
  rule(
    API, "api_depth_contract_validation_ci", "The machine-readable API contract is validated in CI",
    /openapi|swagger|asyncapi|graphql.{0,12}schema/i,
    [/spectral|openapi.{0,12}validate|schema.{0,12}check|contract.?test|graphql-inspector/i], undefined, "WARN",
    "Lint the API contract and compare breaking changes against the released schema in CI.",
    `openapi: 3.1.0\nrun: spectral lint openapi.yaml && openapi validate && contract-test`,
    `openapi: 3.1.0\ninfo: { title: API }`,
  ),

  // ── Payments ─────────────────────────────────────────────────────────────
  rule(
    PAY, "payments_depth_event_deduplication", "Payment provider events are deduplicated",
    /stripe|paddle|braintree|adyen|paypal|payment.{0,12}webhook/i,
    [/event\.id.{0,40}(?:unique|upsert|findUnique|SETNX)|processedEvent|dedup/i], undefined, "FAIL",
    "Persist each provider event id under a unique constraint before applying entitlements or ledger changes.",
    `const seen = await processedEvent.upsert({ where: { id: event.id }, create: { id: event.id } }); // stripe`,
    `stripe.webhooks.constructEvent(body, sig, secret); await grantAccess(event);`,
  ),
  rule(
    PAY, "payments_depth_refund_authorization", "Refunds require an explicit privileged permission",
    /refund/i,
    [/requirePermission\(["']refund|authorizeRefund|role.{0,20}(?:finance|admin)|refundPolicy\.can/i], undefined, "FAIL",
    "Gate refund creation behind a dedicated permission rather than general account access.",
    `router.post("/refunds", requirePermission("refund:create"), createRefund);`,
    `router.post("/refunds", requireUser, createRefund);`,
  ),
  rule(
    PAY, "payments_depth_refund_audit", "Refund decisions create immutable audit evidence",
    /refund/i,
    [/audit.{0,24}refund|refund.{0,24}audit|ledger.{0,20}refund|reason.{0,20}refund/i], undefined, "WARN",
    "Record actor, amount, currency, provider id, reason, and resulting entitlement state for every refund.",
    `await refund(payment); await audit.record("refund.created", { actor, amount, currency, reason });`,
    `await refund(payment);`,
  ),
  rule(
    PAY, "payments_depth_tax_calculation", "Tax is calculated from product and customer jurisdiction",
    /checkout|invoice|subscription|charge/i,
    [/stripeTax|taxjar|avalara|automatic_tax|taxCode|customerTaxLocation/i], undefined, "WARN",
    "Use a maintained tax engine or explicit jurisdiction rules; do not infer tax from currency alone.",
    `checkout.create({ automatic_tax: { enabled: true }, customerTaxLocation });`,
    `checkout.create({ currency: "EUR", tax: 0 });`,
  ),
  rule(
    PAY, "payments_depth_dunning_state", "Failed recurring payments enter a bounded dunning flow",
    /subscription|recurring|invoice\.payment_failed|past_due/i,
    [/dunning|retrySchedule|gracePeriod|suspendAt|payment_failed.{0,30}notify/i], undefined, "WARN",
    "Define retry cadence, customer notices, grace period, and the exact point access changes.",
    `on("invoice.payment_failed", () => dunning.start({ retrySchedule, gracePeriod }));`,
    `on("invoice.payment_failed", console.error);`,
  ),
  rule(
    PAY, "payments_depth_proration_preview", "Subscription changes preview proration before commitment",
    /proration|changePlan|updateSubscription/i,
    [/preview|upcomingInvoice|createPreview|confirm.{0,20}proration/i], undefined, "WARN",
    "Calculate and show the exact immediate charge or credit before changing the subscription.",
    `const preview = await invoices.createPreview({ subscription, proration }); await confirm(preview);`,
    `await updateSubscription({ plan, proration: true });`,
  ),
  rule(
    PAY, "payments_depth_price_allowlist", "Checkout accepts server-owned price identifiers only",
    /priceId|price_id|checkout.{0,16}session/i,
    [/allowedPrices|priceCatalog|lookupPrice|productConfig/i],
    [/price(?:Id|_id)\s*[:=]\s*(?:req|request)\.(?:body|query)/i], "FAIL",
    "Map a client plan key to a server-owned price catalogue and reject unknown or inactive prices.",
    `const priceId = priceCatalog[planKey]; checkout.sessions.create({ line_items: [{ price: priceId }] });`,
    `const priceId = req.body.priceId; checkout.sessions.create({ line_items: [{ price: priceId }] });`,
  ),
  rule(
    PAY, "payments_depth_entitlement_transaction", "Payment state and entitlements update atomically",
    /entitlement|grantAccess|subscriptionStatus|planAccess/i,
    [/transaction\(|unitOfWork|atomic\(|compareAndSet|version.{0,20}entitlement/i], undefined, "FAIL",
    "Update the payment event, subscription state, and entitlement in one transaction with idempotency.",
    `await db.transaction(async tx => { await tx.event.create(); await tx.entitlement.upsert(); });`,
    `await grantAccess(userId); await markPaymentProcessed(event.id);`,
  ),

  // ── Email deliverability ─────────────────────────────────────────────────
  rule(
    MAIL, "email_depth_retry_backoff", "Transient email failures retry with backoff and jitter",
    /resend|sendgrid|postmark|mailgun|nodemailer|sendEmail|mailer/i,
    [/backoff|exponential|jitter|retryDelay|attempt\s*\*\s*attempt/i], undefined, "WARN",
    "Retry only transient responses with capped exponential backoff and jitter; dead-letter permanent failures.",
    `await sendEmail(message, { retries: 3, backoff: "exponential", jitter: true });`,
    `for (let retry = 0; retry < 3; retry++) await sendEmail(message);`,
  ),
  rule(
    MAIL, "email_depth_send_idempotency", "Transactional email sends are idempotent",
    /sendEmail|sendOnce|emails\.send|mailer\.send|deliver_later/i,
    [/idempotency|dedup|messageKey|unique.{0,20}email|sendOnce/i], undefined, "WARN",
    "Create a stable message key from event and recipient so job retries cannot send duplicates.",
    `await sendOnce({ messageKey: \`receipt:\${order.id}:\${user.id}\`, message });`,
    `await sendEmail(receipt);`,
  ),
  rule(
    MAIL, "email_depth_suppression_before_send", "Suppressed and bounced recipients are blocked before send",
    /sendEmail|emails\.send|mailer\.send/i,
    [/isSuppressed|suppressionList|canReceiveEmail|hardBounce|complaintStatus/i], undefined, "WARN",
    "Check the local suppression state before every send and update it from provider delivery events.",
    `if (await suppressionList.isSuppressed(to)) return; await sendEmail(message);`,
    `await sendEmail({ to, subject });`,
  ),
  rule(
    MAIL, "email_depth_one_click_unsubscribe", "Bulk email implements one-click unsubscribe semantics",
    /newsletter|campaign|marketing.{0,12}email|bulk.?mail/i,
    [/List-Unsubscribe-Post|One-Click|unsubscribe.{0,20}POST/i], undefined, "WARN",
    "Send both List-Unsubscribe and List-Unsubscribe-Post headers and process the POST without a login.",
    `headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"; // newsletter`,
    `newsletter.headers["List-Unsubscribe"] = "<https://example.test/unsubscribe>";`,
  ),
  rule(
    MAIL, "email_depth_stream_separation", "Transactional and marketing mail use separate streams",
    /transactional|marketing|newsletter|campaign/i,
    [/messageStream|serverToken.{0,20}(?:transactional|marketing)|subdomain|sendingDomain/i], undefined, "WARN",
    "Separate transactional and bulk mail by provider stream or subdomain so campaign reputation cannot block account mail.",
    `send({ messageStream: isMarketing ? "marketing" : "transactional" });`,
    `send({ from: "hello@example.test" }); // transactional and marketing`,
  ),
  rule(
    MAIL, "email_depth_template_versioning", "Email templates carry a version or immutable identifier",
    /email.{0,12}template|templateId|renderEmail/i,
    [/templateVersion|version\s*[:=]|templateId.{0,24}(?:v\d|revision)|immutableTemplate/i], undefined, "WARN",
    "Version templates so support can reproduce exactly what a recipient saw and roll back a broken release.",
    `renderEmail({ templateId: "receipt", templateVersion: 4, data });`,
    `renderEmail({ templateId: "receipt", data });`,
  ),
  rule(
    MAIL, "email_depth_address_validation", "Recipient addresses are parsed and normalised before send",
    /sendEmail|emails\.send|mailer\.send/i,
    [/emailSchema|isEmail|normalizeEmail|parseAddress|Address\(/i], undefined, "WARN",
    "Validate syntax, normalise conservatively, and reject header characters before handing an address to the provider.",
    `const to = emailSchema.parse(normalizeEmail(input)); await sendEmail({ to });`,
    `await sendEmail({ to: req.body.email });`,
  ),
  rule(
    MAIL, "email_depth_webhook_signature", "Email delivery webhooks authenticate the provider",
    /email.{0,20}webhook|delivery.{0,12}event|bounce.{0,12}webhook/i,
    [/verifyWebhook|verifySignature|svix|webhook-signature|timingSafeEqual/i], undefined, "FAIL",
    "Verify the provider signature over the raw body before changing suppression or delivery state.",
    `app.post("/email-webhook", rawBody, (req) => verifyWebhook(req.headers, req.body));`,
    `app.post("/email-webhook", (req) => processDeliveryEvent(req.body));`,
  ),

  // ── Infrastructure ───────────────────────────────────────────────────────
  rule(
    INFRA, "infra_depth_restore_drill", "Backups are proven with an automated restore test",
    /backup|snapshot|pg_dump|mysqldump/i,
    [/restore.{0,24}(?:test|verify|drill)|pg_restore|recovery.?test|checksum.{0,20}backup/i], undefined, "WARN",
    "Restore the latest backup into an isolated environment on a schedule and verify data-level invariants.",
    `schedule: weekly\nrun: pg_restore backup.dump && verify_restore_test && checksum_backup`,
    `schedule: daily\nrun: pg_dump production > backup.dump`,
  ),
  rule(
    INFRA, "infra_depth_database_tls", "Database connections require certificate-verified TLS",
    /DATABASE_URL|postgres|mysql|mongodb|database/i,
    [/sslmode=(?:verify-full|verify-ca)|rejectUnauthorized\s*:\s*true|tlsCAFile|sslrootcert/i],
    [/sslmode=disable|rejectUnauthorized\s*:\s*false/i], "FAIL",
    "Require database TLS with hostname and CA verification; install the platform CA instead of disabling checks.",
    `DATABASE_URL=postgres://db/app?sslmode=verify-full&sslrootcert=/run/ca.pem`,
    `DATABASE_URL=postgres://db/app?sslmode=disable`,
  ),
  rule(
    INFRA, "infra_depth_resource_limits", "Workloads declare CPU and memory limits",
    /docker-compose|kind:\s*(?:Deployment|StatefulSet)|services:/i,
    [/resources:\s*[\s\S]{0,160}limits:|mem_limit|cpus\s*:/i], undefined, "WARN",
    "Set realistic requests and limits from measured usage so one process cannot starve every colocated service.",
    `kind: Deployment\nresources:\n  limits:\n    memory: 512Mi\n    cpu: 500m`,
    `kind: Deployment\ncontainers:\n  - name: api`,
  ),
  rule(
    INFRA, "infra_depth_readiness_liveness", "Readiness and liveness have separate semantics",
    /kind:\s*(?:Deployment|StatefulSet)|healthcheck|orchestrator/i,
    [/readinessProbe[\s\S]{0,200}livenessProbe|healthcheck.{0,20}start_period/i], undefined, "WARN",
    "Use readiness for dependency availability and liveness only for unrecoverable process failure.",
    `kind: Deployment\nreadinessProbe: { httpGet: { path: /ready } }\nlivenessProbe: { httpGet: { path: /live } }`,
    `kind: Deployment\nlivenessProbe: { httpGet: { path: /health } }`,
  ),
  rule(
    INFRA, "infra_depth_iac_plan_gate", "Infrastructure changes produce a reviewed plan in CI",
    /terraform|tofu|pulumi|cloudformation/i,
    [/(?:terraform|tofu) plan|pulumi preview|change.?set|plan.?artifact/i], undefined, "WARN",
    "Generate a non-destructive plan for pull requests and require review before apply.",
    `pull_request:\n  run: terraform plan -out plan.artifact`,
    `push:\n  run: terraform apply -auto-approve`,
  ),
  rule(
    INFRA, "infra_depth_remote_state_protection", "Infrastructure state is remote, encrypted and locked",
    /terraform|tofu/i,
    [/backend\s+["'](?:s3|gcs|azurerm|remote|http)["']|remote.?state/i, /encrypt\s*=\s*true|kms_key_id|lock_table|use_lockfile/i],
    [/backend\s+["']local["']/i], "FAIL",
    "Store state remotely with encryption, versioning, access control, and locking; never commit local state.",
    `terraform { backend "s3" { encrypt = true; use_lockfile = true; kms_key_id = "alias/state" } }`,
    `terraform { backend "local" { path = "terraform.tfstate" } }`,
  ),
  rule(
    INFRA, "infra_depth_dead_letter_queue", "Asynchronous work has a dead-letter path",
    /sqs|rabbitmq|kafka|bullmq|celery|queue/i,
    [/dead.?letter|redrivePolicy|maxReceiveCount|failedQueue|DLQ/i], undefined, "WARN",
    "After bounded retries, move poison messages to a monitored dead-letter queue with replay tooling.",
    `queue.configure({ redrivePolicy: { deadLetterTargetArn: dlq, maxReceiveCount: 5 } });`,
    `queue.process(async job => handle(job));`,
  ),
  rule(
    INFRA, "infra_depth_secret_versions", "Deployed secrets are versioned for safe rotation",
    /secretsmanager|secret manager|vault|KeyVault|secretRef/i,
    [/versionId|versionStage|secretVersion|rotation|previous.{0,12}secret/i], undefined, "WARN",
    "Reference secret versions or stages and support an overlap window so rotation does not require downtime.",
    `const secret = await secretsmanager.getSecretValue({ SecretId, VersionStage: "AWSCURRENT" }); // rotation`,
    `const secret = process.env.API_SECRET; // secret manager injected with no version`,
  ),

  // ── Performance ──────────────────────────────────────────────────────────
  rule(
    PERF, "perf_depth_web_vitals_telemetry", "Core Web Vitals are measured in real user sessions",
    /next|react|vue|svelte|<html|reportWebVitals|web-vitals/i,
    [/web-vitals|reportWebVitals|onCLS|onINP|onLCP|PerformanceObserver.{0,30}largest-contentful-paint/i], undefined, "WARN",
    "Collect LCP, INP and CLS with release and route context, then track p75 by device class.",
    `import { onCLS, onINP, onLCP } from "web-vitals"; onCLS(send); onINP(send); onLCP(send);`,
    `export function ReactApp() { return <main>Web app</main>; }`,
  ),
  rule(
    PERF, "perf_depth_bundle_budget", "Frontend bundles have an enforced size budget",
    /next|vite|webpack|rollup|frontend|bundle/i,
    [/size-limit|bundlesize|performance\s*:\s*\{[^}]*maxAssetSize|budget.{0,16}(?:kb|bytes)|bundlewatch/i],
    undefined, "WARN",
    "Fail CI when route or entry bundles exceed a versioned compressed-size budget.",
    `size-limit: [{ path: "dist/app.js", limit: "180 KB" }] // bundle budget`,
    `export default { build: { minify: true } }; // vite bundle`,
  ),
  rule(
    PERF, "perf_depth_route_code_splitting", "Heavy routes and features are loaded on demand",
    /react|vue|svelte|next|router|frontend/i,
    [/dynamic\(\s*\(\)\s*=>|React\.lazy|defineAsyncComponent|import\(\s*["'][^"']+["']\s*\)/i], undefined, "WARN",
    "Split route-level and rarely-used features so first load does not pay for the whole application.",
    `const Reports = React.lazy(() => import("./Reports"));`,
    `import Reports from "./Reports"; // frontend router loads every route`,
  ),
  rule(
    PERF, "perf_depth_responsive_images", "Responsive images declare candidate widths and sizes",
    /<img|Image\s*\(|next\/image|picture>/i,
    [/\bsrcset=|\bsrcSet=|\bsizes=|<picture|next\/image/i], undefined, "WARN",
    "Provide srcset and sizes (or a framework image component) so mobile devices do not download desktop assets.",
    `<img src="hero-800.jpg" srcset="hero-400.jpg 400w, hero-800.jpg 800w" sizes="100vw">`,
    `<img src="hero-2400.jpg" alt="Hero">`,
  ),
  rule(
    PERF, "perf_depth_async_image_decode", "Non-critical images decode asynchronously",
    /<img|Image\s*\(/i,
    [/decoding\s*=\s*["']async|decode\(\)|loading\s*=\s*["']lazy/i], undefined, "WARN",
    "Use decoding=async and lazy loading below the fold; keep the LCP image eager and high priority.",
    `<img src="gallery.webp" loading="lazy" decoding="async" alt="Gallery">`,
    `<img src="gallery.webp" alt="Gallery">`,
  ),
  rule(
    PERF, "perf_depth_passive_listeners", "Scroll and touch listeners do not block scrolling",
    /addEventListener\(\s*["'](?:scroll|touchstart|touchmove|wheel)/i,
    [/passive\s*:\s*true/i], undefined, "WARN",
    "Mark non-cancelling scroll, touch and wheel listeners passive and move expensive work behind requestAnimationFrame.",
    `window.addEventListener("scroll", onScroll, { passive: true });`,
    `window.addEventListener("scroll", onScroll);`,
  ),
  rule(
    PERF, "perf_depth_render_containment", "Large off-screen sections use rendering containment",
    /long.?list|feed|catalog|dashboard|content-visibility/i,
    [/content-visibility\s*:\s*auto|contain-intrinsic-size|contain\s*:\s*(?:layout|content|strict)/i], undefined, "WARN",
    "Apply content-visibility or CSS containment to large independent sections after measuring layout behavior.",
    `.catalog-section { content-visibility: auto; contain-intrinsic-size: 600px; }`,
    `.catalog-section { min-height: 600px; } /* long list */`,
  ),
  rule(
    PERF, "perf_depth_long_task_observer", "Browser long tasks are measured",
    /PerformanceObserver|telemetry|web-vitals|browser/i,
    [/entryTypes\s*:\s*\[[^\]]*["']longtask|type\s*:\s*["']longtask|event-loop-utilization/i], undefined, "WARN",
    "Observe long tasks and attribute them to route, release, and third-party script so INP regressions are diagnosable.",
    `new PerformanceObserver(report).observe({ entryTypes: ["longtask"] });`,
    `new PerformanceObserver(report).observe({ entryTypes: ["paint"] });`,
  ),

  // ── AI safety ────────────────────────────────────────────────────────────
  rule(
    AI, "ai_safety_output_not_executed", "Model output is never evaluated as executable code",
    /openai|anthropic|generateText|chat\.completions|language.?model/i,
    [/safeParse|JSON\.parse|outputSchema|structuredOutput|sandbox/i],
    [/\beval\(\s*(?:output|response|completion)|new Function\(\s*(?:output|response|completion)/i], "FAIL",
    "Treat model output as untrusted data, validate it against a narrow schema, and never pass it to eval or Function.",
    `const output = await generateText(); const parsed = outputSchema.safeParse(JSON.parse(output.text));`,
    `const output = await openai.chat.completions.create(input); eval(output);`,
  ),
  rule(
    AI, "ai_safety_tool_allowlist", "AI tools are selected from an explicit allow-list",
    /tools?\s*[:=]|toolCall|function.?calling/i,
    [/allowedTools|toolAllowlist|tools\s*:\s*\[[^\]]|toolRegistry\.get/i],
    [/tools?\s*=\s*(?:req|request)\.(?:body|query)|toolRegistry\[\s*toolCall\.name\s*\]/i], "FAIL",
    "Resolve requested tools through a server-owned allow-list and reject unknown names before argument validation.",
    `const tool = allowedTools.get(toolCall.name); if (!tool) throw new Error("Unknown tool");`,
    `const tool = toolRegistry[toolCall.name]; await tool(toolCall.arguments);`,
  ),
  rule(
    AI, "ai_safety_tool_iteration_cap", "Agent loops enforce a hard tool-iteration limit",
    /while\s*\(|for\s*\(|maxSteps|toolCall/i,
    [/maxSteps|maxIterations|stepCount\s*[<>]=?\s*\d+|for\s*\([^;]+;[^;]+<\s*\d+/i], undefined, "WARN",
    "Set a hard step count, wall-clock deadline, and token budget so a looping agent cannot spend indefinitely.",
    `for (let stepCount = 0; stepCount < 8; stepCount++) { await toolCall(); } // maxIterations`,
    `while (toolCall) { await execute(toolCall); }`,
  ),
  rule(
    AI, "ai_safety_remote_content_boundary", "Retrieved content is explicitly marked as untrusted",
    /retrieve|searchResults|webContent|documentChunks|rag/i,
    [/untrusted.{0,24}content|dataBoundary|quoteRetrieved|escapePrompt|sourceType\s*:\s*["']external/i], undefined, "WARN",
    "Place retrieved text in a typed data field with provenance and tell the model it cannot override system instructions.",
    `prompt.add({ sourceType: "external", trust: "untrusted", content: quoteRetrieved(documentChunks) });`,
    `prompt += "\\n" + webContent; // RAG retrieved results`,
  ),
  rule(
    AI, "ai_safety_url_egress_policy", "AI-requested network destinations are constrained",
    /fetch\(|axios\(|http\.request|browser\.open|urlTool/i,
    [/allowedHosts|egressPolicy|assertSafeUrl|isPrivateAddress|dnsRebinding/i],
    [/fetch\(\s*(?:toolCall|args|request)\.(?:url|target)|axios\(\s*args\.url/i], "FAIL",
    "Parse the URL, require HTTPS, allow-list hosts, block private/link-local ranges, and re-check after redirects and DNS resolution.",
    `const url = assertSafeUrl(args.url, { allowedHosts, blockPrivate: true }); await fetch(url);`,
    `await fetch(toolCall.url);`,
  ),
  rule(
    AI, "ai_safety_sensitive_telemetry", "AI telemetry excludes prompts and sensitive payloads by default",
    /prompt|completion|modelResponse|toolCall|tokenCount|captureContent/i,
    [/redact|hashPrompt|metadataOnly|captureContent\s*:\s*false|sanitizeTelemetry/i],
    [/logger\.\w+\([^)]*(?:prompt|completion|modelResponse)|captureContent\s*:\s*true/i], "FAIL",
    "Log model, latency, token counts and outcome by default; store content only through an explicit redacted, access-controlled path.",
    `logger.info(sanitizeTelemetry({ model, tokenCount, latency, captureContent: false }));`,
    `logger.info({ prompt, completion: modelResponse });`,
  ),
  rule(
    AI, "ai_safety_code_execution_sandbox", "AI-generated code runs only inside a constrained sandbox",
    /generatedCode|executeCode|codeInterpreter|runPython|runShell/i,
    [/sandbox|isolated-vm|container|seccomp|networkDisabled|resourceLimits/i],
    [/child_process\.(?:exec|spawn)\(\s*generatedCode|exec\(\s*modelResponse/i], "FAIL",
    "Use an ephemeral sandbox with no host credentials, no default network, read-only inputs, resource limits, and a deadline.",
    `await sandbox.execute(generatedCode, { networkDisabled: true, resourceLimits, timeout: 5000 });`,
    `await child_process.exec(generatedCode);`,
  ),
  rule(
    AI, "ai_safety_refusal_regression", "Safety and refusal behavior has versioned regression tests",
    /openai|anthropic|generateText|language.?model|safetyEval/i,
    [/refusal.{0,20}(?:test|fixture|eval)|safetyEval|adversarialFixture|harmfulPrompt/i], undefined, "WARN",
    "Keep versioned adversarial fixtures and fail release when high-risk requests stop refusing or safe requests over-refuse.",
    `describe("safetyEval", () => it("refuses harmfulPrompt fixture", async () => expect(result.refusal).toBe(true)));`,
    `const result = await anthropic.messages.create(request);`,
  ),

  // ── Vibe-code hygiene ────────────────────────────────────────────────────
  rule(
    VIBE, "vibe_depth_strict_types", "Type checking runs in strict mode",
    /tsconfig\.json|compilerOptions|typescript/i,
    [/["']strict["']\s*:\s*true|strict\s*=\s*true/i],
    [/["']strict["']\s*:\s*false|noImplicitAny["']\s*:\s*false/i], "WARN",
    "Enable strict type checking, fix the resulting boundary errors, and run the compiler in CI.",
    `tsconfig.json { "compilerOptions": { "strict": true } }`,
    `tsconfig.json { "compilerOptions": { "strict": false } }`,
  ),
  rule(
    VIBE, "vibe_depth_lint_not_bypassed", "Lint rules are not bypassed at file or project scope",
    /eslint|biome|ruff|swiftlint|lint/i,
    undefined,
    [/eslint-disable(?!-next-line)|biome-ignore-all|ruff:\s*noqa|swiftlint:disable\s+all/i], "WARN",
    "Remove blanket suppressions; use the narrowest line-level exception with a reason and an expiry.",
    `eslint.config.js export default [{ rules: { "no-eval": "error" } }];`,
    `/* eslint-disable */ export function generatedApp() { return true; }`,
  ),
  rule(
    VIBE, "vibe_depth_no_unexplained_type_suppression", "Type suppressions are explicit and reviewable",
    /\.tsx?$|typescript|interface\s+\w+|type\s+\w+\s*=|@ts-(?:ignore|nocheck)|as\s+any/i,
    undefined,
    [/@ts-ignore\b|@ts-nocheck\b|as\s+any\b/i], "WARN",
    "Replace broad suppressions with a typed adapter; if unavoidable, use an expected-error annotation tied to a tracked issue.",
    `interface User { id: string } const user: User = parseUser(input);`,
    `// @ts-ignore\nconst user = response as any;`,
  ),
  rule(
    VIBE, "vibe_depth_environment_schema", "Environment variables are validated at startup",
    /process\.env|import\.meta\.env|os\.environ|getenv\(/i,
    [/zod|envalid|envSchema|BaseSettings|validateEnv|requiredEnv/i], undefined, "WARN",
    "Parse environment variables once at startup, validate types and required values, and refuse to boot on invalid configuration.",
    `const env = envSchema.parse(process.env); // zod startup validation`,
    `const apiKey = process.env.API_KEY;`,
  ),
  rule(
    VIBE, "vibe_depth_boundary_validation", "Untrusted request data is parsed before use",
    /req\.(?:body|query|params)|request\.(?:json|body)|FormData\(/i,
    [/\.parse\(|safeParse\(|validate\(|schema|pydantic|class-validator/i], undefined, "FAIL",
    "Validate request bodies, query parameters, route parameters, and uploaded metadata against bounded schemas.",
    `const input = requestSchema.parse(req.body);`,
    `const input = req.body; await db.user.create({ data: input });`,
  ),
  rule(
    VIBE, "vibe_depth_ui_error_boundary", "The UI has a recoverable error boundary",
    /react|next|vue|svelte|frontend|createBrowserRouter|ErrorBoundary/i,
    [/ErrorBoundary|errorElement|error\.tsx|onErrorCaptured|\+error\.svelte/i], undefined, "WARN",
    "Add a top-level and route-level error boundary with retry, support context, and safe diagnostic capture.",
    `const router = createBrowserRouter([{ element: <App />, errorElement: <ErrorBoundary /> }]);`,
    `export function ReactApp() { return <Routes />; }`,
  ),
  rule(
    VIBE, "vibe_depth_async_ui_states", "Data-driven screens define loading, error and empty states",
    /useQuery|fetch\(|loadData|asyncData|FutureBuilder/i,
    [/loading|isPending|skeleton/i, /error|isError|retry/i, /empty|no results|length\s*===\s*0/i], undefined, "WARN",
    "Design explicit loading, failure, retry, empty, and success states instead of rendering an unexplained blank panel.",
    `const q = useQuery(opts); if (q.isPending) return <Skeleton/>; if (q.isError) return <Retry/>; if (q.data.length === 0) return <Empty/>;`,
    `const q = useQuery(opts); return <List items={q.data} />;`,
  ),
  rule(
    VIBE, "vibe_depth_no_unresolved_markers", "Release source contains no unresolved implementation markers",
    /export\s+(?:async\s+)?function|class\s+\w+|def\s+\w+|func\s+\w+/i,
    undefined,
    [/\bTODO\b|\bFIXME\b|implement (?:this|later)|not implemented|throw new Error\(["']TODO/i], "WARN",
    "Resolve the work, remove dead scaffolding, or link a precise tracked issue that cannot affect the release path.",
    `export function calculateTotal(items) { return items.reduce(sum, 0); }`,
    `export function calculateTotal(items) { throw new Error("TODO: implement later"); }`,
  ),

  // ── Business operations ──────────────────────────────────────────────────
  rule(
    BUSINESS, "business_depth_incident_runbook", "An incident-response runbook is version-controlled",
    /runbook|operations|incident|production/i,
    [/incident commander|severity|mitigat|rollback|communication|postmortem/i], undefined, "WARN",
    "Document severity, ownership, triage, mitigation, rollback, communications, evidence preservation, and review.",
    `incident-runbook.md\nseverity: SEV1\nincident commander\nmitigation and rollback\ncustomer communication\npostmortem`,
    `operations.md\nProduction incident contact: engineering`,
  ),
  rule(
    BUSINESS, "business_depth_continuity_objectives", "Business continuity defines tested RTO and RPO",
    /business continuity|disaster recovery|backup|recovery plan/i,
    [/\bRTO\b|recovery time objective/i, /\bRPO\b|recovery point objective/i, /test|drill|exercise/i], undefined, "WARN",
    "Set service-specific RTO/RPO targets and prove them with scheduled recovery exercises.",
    `disaster recovery plan\nRTO: 2 hours\nRPO: 15 minutes\nquarterly restore drill`,
    `backup and recovery plan: backups run daily`,
  ),
  rule(
    BUSINESS, "business_depth_service_ownership", "Critical services have named technical and business owners",
    /CODEOWNERS|service catalog|ownership|owners:/i,
    [/technical owner|business owner|team\/|@\w[\w-]+|owner:\s*\w/i],
    [/owner:\s*(?:TBD|unknown|none)\b/i], "WARN",
    "Assign technical and business owners plus an escalation contact for each production service.",
    `CODEOWNERS\n/api/ @platform-team\nservice catalog\ntechnical owner: Platform\nbusiness owner: Product`,
    `service catalog\nowner: TBD`,
  ),
  rule(
    BUSINESS, "business_depth_decision_records", "Material architecture decisions are recorded",
    /architecture decision|ADR-|decision record|docs\/adr/i,
    [/status:/i, /context:/i, /decision:/i, /consequences:/i], undefined, "WARN",
    "Record context, considered options, decision, consequences, owner, and review date for irreversible choices.",
    `ADR-004.md\nstatus: accepted\ncontext: scaling\ndecision: queue writes\nconsequences: eventual consistency`,
    `architecture decision: use a queue`,
  ),
  rule(
    BUSINESS, "business_depth_support_escalation", "Support has severity and escalation rules",
    /support|customer issue|ticket|helpdesk/i,
    [/severity|priority.{0,12}P[0-3]|escalat|response target|on-call/i], undefined, "WARN",
    "Define customer-visible severities, response targets, ownership hand-offs, and an emergency escalation route.",
    `support runbook\nseverity P0: page on-call\nresponse target: 15 minutes\nescalation: incident commander`,
    `support requests go to helpdesk`,
  ),
  rule(
    BUSINESS, "business_depth_data_classification", "Business data has a classification scheme",
    /data classification|sensitive data|personal data|confidential/i,
    [/public|internal|confidential|restricted/i, /handling|retention|encryption|access/i], undefined, "WARN",
    "Classify data and bind each class to access, encryption, logging, retention, and disposal requirements.",
    `data classification: public, internal, confidential, restricted\nhandling: encrypt restricted data; retention: 30 days; access: need-to-know`,
    `sensitive data should be protected`,
  ),
  rule(
    BUSINESS, "business_depth_vendor_register", "Third-party services have an owned risk register",
    /vendor|supplier|subprocessor|third-party service/i,
    [/owner|data shared|criticality|review date|exit plan/i, /risk|assessment|due diligence/i], undefined, "WARN",
    "Track owner, purpose, data shared, criticality, assurance, renewal, exit plan, and review date for every vendor.",
    `vendor register\nowner: Ops\ndata shared: email\ncriticality: high\nrisk assessment: complete\nreview date: 2026-10-01\nexit plan: export`,
    `third-party service: Email Provider`,
  ),
  rule(
    BUSINESS, "business_depth_change_approval", "Production changes have an explicit approval and rollback path",
    /deploy|release|production change|change management/i,
    [/approval|reviewer|required review|change ticket/i, /rollback|revert|backout/i], undefined, "WARN",
    "Require risk-proportionate review, record the approver, and define a tested rollback before production execution.",
    `production release\napproval: required reviewer\nchange ticket: CHG-123\nrollback: revert deployment`,
    `deploy to production on push`,
  ),

  // ── SaaS readiness ───────────────────────────────────────────────────────
  rule(
    SAAS, "saas_depth_tenant_isolation_tests", "Tenant isolation has explicit cross-tenant tests",
    /workspaceId|tenantId|organizationId/i,
    [/cross.?tenant|other tenant|tenant isolation|expect\([^)]*403/i], undefined, "FAIL",
    "Test that a valid identifier from another tenant cannot be read, changed, exported, or inferred.",
    `describe("tenant isolation", () => it("rejects other tenant id", () => expect(status).toBe(403))); workspaceId`,
    `const workspaceId = session.workspaceId;`,
  ),
  rule(
    SAAS, "saas_depth_onboarding_checkpoint", "Onboarding progress is durable and resumable",
    /onboarding|setup wizard|first.?run/i,
    [/checkpoint|completedSteps|resume|onboardingState|persist/i], undefined, "WARN",
    "Persist completed steps server-side and make every step safe to resume or repeat after interruption.",
    `await onboardingState.persist({ completedSteps, checkpoint: "invite-team" });`,
    `const onboardingStep = useState(0);`,
  ),
  rule(
    SAAS, "saas_depth_feature_flag_defaults", "Feature flags have safe defaults and ownership",
    /feature.?flag|isEnabled|unleash|launchdarkly/i,
    [/defaultValue|fallback|owner|expiresAt|kill.?switch/i], undefined, "WARN",
    "Define a safe default, owner, expiry/review date, and kill-switch behavior for every flag.",
    `featureFlag("new-billing", { defaultValue: false, owner: "payments", expiresAt, killSwitch: true });`,
    `if (isEnabled("new-billing")) renderNewBilling();`,
  ),
  rule(
    SAAS, "saas_depth_usage_meter_idempotency", "Usage metering is idempotent and traceable",
    /usage|meter|quota|credits|consumption/i,
    [/idempotency|eventId|dedup|unique.{0,20}usage|ledger/i], undefined, "FAIL",
    "Write immutable usage events with a provider/source id under a unique constraint; derive totals from the ledger.",
    `usageLedger.insert({ eventId, quantity, source }); // unique eventId idempotency`,
    `account.credits -= request.units;`,
  ),
  rule(
    SAAS, "saas_depth_export_job", "Large customer exports run as bounded background jobs",
    /data export|exportUserData|exportWorkspace|download archive/i,
    [/queue|background job|expiresAt|signedUrl|progress/i], undefined, "WARN",
    "Queue exports, scope them to the requester, expire the artifact, and expose progress without blocking a request.",
    `await queue.add("data export", { workspaceId }); return { progressUrl }; // signedUrl expiresAt`,
    `return exportWorkspace(workspaceId); // download archive in request`,
  ),
  rule(
    SAAS, "saas_depth_account_deletion_workflow", "Account deletion covers data, access and external processors",
    /delete account|deleteAccount|account deletion/i,
    [/revoke|session|processor|subprocessor|scheduledDeletion|gracePeriod/i], undefined, "WARN",
    "Re-authenticate, revoke sessions, schedule deletion, propagate to processors, retain only documented obligations, and confirm completion.",
    `deleteAccount({ reauth, revokeSessions: true, scheduledDeletion, processors, gracePeriod });`,
    `await db.user.delete({ where: { id } }); // delete account`,
  ),
  rule(
    SAAS, "saas_depth_notification_preferences", "Users control notification channels and categories",
    /notification|sendEmail|push/i,
    [/preferences|optOut|channel|notificationSettings|category/i], undefined, "WARN",
    "Store per-category, per-channel preferences and apply them before enqueueing non-essential notifications.",
    `if (notificationSettings.category[type].channel.email) await sendEmail(message);`,
    `await sendEmail(notification);`,
  ),
  rule(
    SAAS, "saas_depth_admin_audit_timeline", "Workspace administrators can inspect security-relevant activity",
    /workspace admin|admin console|organization admin|audit log|audit timeline/i,
    [/actor|action|target|timestamp|audit timeline|security event/i], undefined, "WARN",
    "Expose an immutable, filterable timeline containing actor, action, target, result, IP/device context, and timestamp.",
    `admin audit timeline: security event { actor, action, target, result, timestamp }`,
    `workspace admin console with activity list`,
  ),

  // ── Legal & compliance implementation ───────────────────────────────────
  rule(
    LEGAL, "legal_depth_consent_receipt", "Consent creates a versioned receipt",
    /consent|cookie preferences|marketing opt.?in/i,
    [/policyVersion|consentVersion|purposes|grantedAt|consentReceipt/i], undefined, "WARN",
    "Persist purposes, policy version, choice, timestamp, source, and withdrawal state without storing unnecessary identifiers.",
    `consentReceipt.create({ purposes, consentVersion, grantedAt, source });`,
    `user.marketingConsent = true;`,
  ),
  rule(
    LEGAL, "legal_depth_policy_acceptance_version", "Terms acceptance records the exact policy version",
    /acceptTerms|terms accepted|policy acceptance|agree to terms/i,
    [/termsVersion|policyVersion|documentHash|acceptedAt/i], undefined, "WARN",
    "Store the immutable version/hash and acceptance timestamp so the accepted wording can be reconstructed.",
    `acceptTerms({ termsVersion: "2026-07", documentHash, acceptedAt: new Date() });`,
    `user.acceptTerms = true;`,
  ),
  rule(
    LEGAL, "legal_depth_dsar_identity", "Privacy-rights requests verify the requester",
    /DSAR|data subject request|DataSubjectRequest|privacy request|access request/i,
    [/verifyIdentity|identity check|authenticated user|verificationStatus/i], undefined, "FAIL",
    "Verify identity proportionately before disclosing, correcting, exporting, or deleting personal data.",
    `privacyRequest.create({ verificationStatus: await verifyIdentity(requester), type: "DSAR" });`,
    `app.post("/privacy-request", submitDataSubjectRequest);`,
  ),
  rule(
    LEGAL, "legal_depth_processor_deletion", "Erasure propagates to processors and derived stores",
    /erase|erasure|delete personal data|deleteUserData|deletionJob/i,
    [/processor|subprocessor|search index|analytics|backup|deletionJob/i], undefined, "WARN",
    "Track deletion across primary data, search/cache/analytics copies, processors, and backup expiry with completion evidence.",
    `deletionJob.run({ primary: true, searchIndex: true, analytics: true, processors, backupExpiry });`,
    `await deleteUserData(userId);`,
  ),
  rule(
    LEGAL, "legal_depth_retention_enforcement", "Retention periods are enforced by scheduled jobs",
    /retention|expiresAt|deleteAfter|data lifecycle/i,
    [/cron|schedule|retentionJob|deleteMany|lifecycle rule/i], undefined, "WARN",
    "Enforce each documented retention period automatically and alert when deletion jobs fail.",
    `schedule("daily", retentionJob); await db.events.deleteMany({ where: { expiresAt: { lt: now } } });`,
    `const retention = "keep events for 30 days";`,
  ),
  rule(
    LEGAL, "legal_depth_export_authorization", "Personal-data exports are access-controlled and short-lived",
    /exportUserData|data portability|personal data export/i,
    [/requireRecentAuth|authorize|signedUrl|expiresAt|oneTime/i], undefined, "FAIL",
    "Require recent authentication, scope the dataset server-side, encrypt at rest, and expire the one-time download.",
    `requireRecentAuth(); authorize(userId); return signedUrl(exportUserData(userId), { expiresAt, oneTime: true });`,
    `return exportUserData(req.query.userId);`,
  ),
  rule(
    LEGAL, "legal_depth_child_consent", "Age-sensitive processing has a verifiable guardian path",
    /dateOfBirth|age gate|minor|child|parental consent/i,
    [/guardian|parentalConsent|ageAssurance|consentToken/i], undefined, "WARN",
    "When the service may process children's data, implement age assurance and verifiable guardian consent appropriate to market.",
    `if (minor) await parentalConsent.verify({ guardian, consentToken }); // age assurance`,
    `if (dateOfBirth && age < 13) return false; // age gate only`,
  ),
  rule(
    LEGAL, "legal_depth_consent_withdrawal", "Consent can be withdrawn as easily as it is granted",
    /grantConsent|revokeConsent|marketingConsent|cookieConsent|consent preferences/i,
    [/withdrawConsent|revokeConsent|optOut|preferences.{0,20}update/i], undefined, "WARN",
    "Expose an authenticated and public-cookie path to withdraw each optional purpose and apply it immediately.",
    `preferences.update({ marketing: false }); await revokeConsent("marketing");`,
    `await grantConsent("marketing");`,
  ),

  // ── Global distribution implementation ──────────────────────────────────
  rule(
    GLOBAL, "global_depth_locale_fallback", "Localisation has an explicit fallback locale",
    /i18n|locales|translations|localization/i,
    [/fallbackLng|fallbackLocale|defaultLocale|Locale\.current/i], undefined, "WARN",
    "Choose and test a fallback locale so a missing key never renders an identifier or blank string.",
    `i18n.init({ locales: ["en", "fr"], fallbackLng: "en" });`,
    `i18n.init({ locales: ["en", "fr"] });`,
  ),
  rule(
    GLOBAL, "global_depth_translation_parity", "Translation catalogues are checked for missing keys",
    /i18n|translations|locales/i,
    [/missing.?key|translation.{0,12}(?:test|check|lint)|i18n-check|locale parity/i], undefined, "WARN",
    "Compare every locale to the source catalogue in CI and fail on missing or orphaned keys.",
    `run: i18n-check --missing-key --locale-parity translations/`,
    `translations/en.json\ntranslations/fr.json`,
  ),
  rule(
    GLOBAL, "global_depth_locale_formatters", "Dates, numbers and lists use locale-aware formatters",
    /date|currency|amount|number|list/i,
    [/Intl\.(?:DateTimeFormat|NumberFormat|ListFormat)|DateFormatter|NumberFormatter|java\.text\.NumberFormat/i],
    undefined, "WARN",
    "Use platform locale formatters with an explicit locale and timezone; never assemble customer-facing formats manually.",
    `const amount = new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);`,
    `const amount = "$" + value.toFixed(2);`,
  ),
  rule(
    GLOBAL, "global_depth_utc_storage", "Persisted timestamps have explicit UTC semantics",
    /createdAt|updatedAt|timestamp|datetime|Date\(/i,
    [/UTC|toISOString\(|timestamptz|DateTimeOffset|Instant\b/i],
    [/toLocaleString\(\).{0,30}(?:save|insert|create)|timestamp without time zone/i], "WARN",
    "Store instants as UTC with offset-aware types and convert only at the presentation boundary.",
    `const createdAt = new Date().toISOString(); // UTC timestamptz`,
    `const createdAt = new Date().toLocaleString(); await db.insert({ createdAt });`,
  ),
  rule(
    GLOBAL, "global_depth_currency_precision", "Currency values preserve ISO currency and minor-unit precision",
    /currency|amount|price|money/i,
    [/currencyCode|minorUnits|Decimal|BigInt|Money\(/i],
    [/(?:amount|price)\s*[:=]\s*\d+\.\d+\b/i], "WARN",
    "Carry amount and ISO currency together, using integer minor units or a decimal money type.",
    `const total = Money({ minorUnits: 1099n, currencyCode: "GBP" });`,
    `const price = 10.99; const currency = "GBP";`,
  ),
  rule(
    GLOBAL, "global_depth_rtl_logical_layout", "Layouts use logical properties for RTL compatibility",
    /dir=|rtl|direction\s*:/i,
    [/margin-inline|padding-inline|inset-inline|text-align\s*:\s*(?:start|end)|leading|trailing/i],
    [/margin-left|margin-right|left\s*:\s*\d|right\s*:\s*\d/i], "WARN",
    "Use logical inline/block properties and test mirrored navigation, icons, and mixed-direction text.",
    `<html dir="rtl"><style>.card { margin-inline-start: 1rem; text-align: start; }</style>`,
    `<html dir="rtl"><style>.card { margin-left: 1rem; text-align: left; }</style>`,
  ),
  rule(
    GLOBAL, "global_depth_unicode_normalization", "User identifiers are Unicode-normalised consistently",
    /username|email|slug|identifier|search query/i,
    [/normalize\(["']NFKC|Normalizer\.normalize|casefold|unicode.?normal/i], undefined, "WARN",
    "Normalise once using a documented form before uniqueness, comparison, and security-sensitive matching.",
    `const username = input.normalize("NFKC").toLocaleLowerCase("und");`,
    `const username = input.toLowerCase();`,
  ),
  rule(
    GLOBAL, "global_depth_residency_routing", "Regional data residency is enforced in infrastructure routing",
    /region|data residency|tenantRegion|deploymentRegion/i,
    [/regionAllowlist|residencyPolicy|routeToRegion|regionalDatabase|dataLocation/i], undefined, "WARN",
    "Bind tenant residency to approved storage, processing, backup, and support-access regions and test fail-closed routing.",
    `const region = residencyPolicy.routeToRegion(tenantRegion, regionAllowlist); use regionalDatabase(region);`,
    `const region = req.query.region ?? deploymentRegion;`,
  ),

  // ── Missing product pages (repo route evidence) ──────────────────────────
  rule(
    PAGES, "pages_depth_accessibility_route", "An accessibility statement route exists in source",
    /next|react|vue|svelte|router|routes/i,
    [/\/accessibility|accessibility-statement|AccessibilityStatement/i], undefined, "WARN",
    "Publish an accessibility statement with conformance target, known limitations, contact route, and review date.",
    `router.addRoute("/accessibility", AccessibilityStatement);`,
    `export const routes = ["/", "/pricing", "/contact"]; // react router`,
  ),
  rule(
    PAGES, "pages_depth_privacy_request_route", "A privacy-rights request route exists in source",
    /next|react|vue|svelte|router|routes/i,
    [/privacy-request|data-request|privacy\/rights|PrivacyRequest/i], undefined, "WARN",
    "Provide a discoverable request flow for access, correction, portability, deletion, objection, and appeal where applicable.",
    `router.addRoute("/privacy-request", PrivacyRequest);`,
    `export const routes = ["/privacy", "/terms"]; // next router`,
  ),
  rule(
    PAGES, "pages_depth_account_deletion_route", "An account-deletion help or settings route exists",
    /account|settings|router|routes/i,
    [/delete-account|account\/delete|close-account|DeleteAccount/i], undefined, "WARN",
    "Expose deletion in authenticated settings and document consequences, grace period, retention, and recovery.",
    `settingsRoutes.push({ path: "/account/delete", component: DeleteAccount });`,
    `settingsRoutes.push({ path: "/account/profile", component: AccountProfile });`,
  ),
  rule(
    PAGES, "pages_depth_data_export_route", "A customer data-export route exists",
    /account|settings|router|routes/i,
    [/export-data|data-export|download-data|ExportData/i], undefined, "WARN",
    "Expose a scoped data export with progress, format, expiry, and a recent-authentication check.",
    `settingsRoutes.push({ path: "/account/export-data", component: ExportData });`,
    `settingsRoutes.push({ path: "/account/billing", component: Billing });`,
  ),
  rule(
    PAGES, "pages_depth_incident_history_route", "A public incident-history route exists",
    /status|incident|router|routes/i,
    [/incident-history|status\/history|past-incidents|IncidentHistory/i], undefined, "WARN",
    "Publish resolved incidents with duration, affected components, impact, remediation, and follow-up status.",
    `statusRoutes.push({ path: "/status/history", component: IncidentHistory });`,
    `statusRoutes.push({ path: "/status", component: CurrentStatus });`,
  ),
  rule(
    PAGES, "pages_depth_security_disclosure_route", "A vulnerability-disclosure route exists",
    /security|router|routes|SECURITY\.md/i,
    [/security\/report|vulnerability-disclosure|report-security|security\.txt/i], undefined, "WARN",
    "Publish scope, safe harbour, contact, encryption key, response expectations, and out-of-scope testing.",
    `securityRoutes.push({ path: "/security/report", component: VulnerabilityDisclosure });`,
    `securityRoutes.push({ path: "/security", component: SecurityOverview });`,
  ),
  rule(
    PAGES, "pages_depth_supported_platforms_route", "Supported browsers and platforms are documented",
    /docs|help|router|routes/i,
    [/supported-browsers|system-requirements|supported-platforms|compatibility/i], undefined, "WARN",
    "Document supported browser/OS versions, accessibility dependencies, network requirements, and deprecation policy.",
    `docsRoutes.push({ path: "/docs/system-requirements", title: "Supported browsers and platforms" });`,
    `docsRoutes.push({ path: "/docs/getting-started", title: "Help" });`,
  ),
  rule(
    PAGES, "pages_depth_onboarding_guide_route", "A customer onboarding guide exists",
    /docs|help|onboarding|router|routes/i,
    [/getting-started|quickstart|onboarding-guide|setup-guide/i], undefined, "WARN",
    "Provide a task-oriented guide from first login to first value, including prerequisites, sample data, and troubleshooting.",
    `docsRoutes.push({ path: "/docs/getting-started", title: "Onboarding guide and quickstart" });`,
    `docsRoutes.push({ path: "/docs/api", title: "Reference" });`,
  ),
];

export const OPERATIONAL_DEPTH_KEYS = OPERATIONAL_DEPTH_RULES.map((item) => item.key);

export const OPERATIONAL_DEPTH_REGISTRY = OPERATIONAL_DEPTH_RULES.map((item) => ({
  key: item.key,
  category: item.category,
  label: item.label,
}));

type Evaluation = Pick<PulseScanCheckInput, "status" | "detail"> & {
  missingRequired: boolean;
  forbiddenMatched: boolean;
};

function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

function evaluateText(ruleDef: OperationalDepthRule, text: string): Evaluation {
  if (!test(ruleDef.subject, text)) {
    return {
      status: "SKIPPED",
      detail: "Not applicable — the repository sample contains no evidence of this feature.",
      missingRequired: false,
      forbiddenMatched: false,
    };
  }

  const missingRequired = (ruleDef.required ?? []).some((pattern) => !test(pattern, text));
  const forbiddenMatched = (ruleDef.forbidden ?? []).some((pattern) => test(pattern, text));
  const ok = !missingRequired && !forbiddenMatched;
  return {
    status: ok ? "PASS" : ruleDef.onMissing,
    detail: ok
      ? `${ruleDef.label}: supporting implementation evidence was found.`
      : `${ruleDef.label}: the required safeguard was not established. Remediation: ${ruleDef.remediation}`,
    missingRequired,
    forbiddenMatched,
  };
}

export function evaluateOperationalRuleText(
  ruleDef: OperationalDepthRule,
  text: string,
): Pick<PulseScanCheckInput, "status" | "detail"> {
  return evaluateText(ruleDef, text);
}

function sourceCoverage(snapshot: RepoSnapshot): { sampled: number; total: number; ratio: number } {
  const sourcePattern = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|php|go|java|kt|swift|dart|cs|rs)$/i;
  const sampled = [...snapshot.files.keys()].filter((path) => sourcePattern.test(path)).length;
  const total = snapshot.paths.filter((path) => sourcePattern.test(path)).length;
  return { sampled, total, ratio: total === 0 ? 0 : sampled / total };
}

function evidencePath(snapshot: RepoSnapshot, ruleDef: OperationalDepthRule): string | undefined {
  const patterns = [...(ruleDef.forbidden ?? []), ruleDef.subject];
  for (const pattern of patterns) {
    for (const [path, content] of snapshot.files) {
      if (test(pattern, `${path}\n${content}`)) return path;
    }
  }
  return undefined;
}

export function evaluateOperationalDepthChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const text = [...snapshot.files].map(([path, content]) => `${path}\n${content}`).join("\n");
  const coverage = sourceCoverage(snapshot);

  return OPERATIONAL_DEPTH_RULES.map((ruleDef): PulseScanCheckInput => {
    const result = evaluateText(ruleDef, text);
    const weakAbsence =
      result.status !== "PASS" &&
      result.status !== "SKIPPED" &&
      result.missingRequired &&
      !result.forbiddenMatched &&
      coverage.ratio < SOUND_ABSENCE_COVERAGE;

    const evidence = result.status === "SKIPPED" ? undefined : evidencePath(snapshot, ruleDef);
    return {
      category: ruleDef.category,
      checkKey: ruleDef.key,
      label: ruleDef.label,
      status: result.status,
      detail: result.detail,
      confidence: weakAbsence ? "LOW" : "HIGH",
      ...(weakAbsence
        ? {
            confidenceReason:
              `Only ${coverage.sampled} of ${coverage.total} source files were read, so absent implementation ` +
              "evidence is not established.",
          }
        : {}),
      evidence: evidence ? `Repository evidence: ${evidence}` : undefined,
    };
  });
}

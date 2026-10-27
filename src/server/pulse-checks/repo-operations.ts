// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS PRACTICES, READ FROM THE REPOSITORY.
//
// These keys used to be answered by searching a WEBSITE's HTML for vendor names
// ("pagerduty", "checkly", "winston"), which says nothing about the practice and
// was withheld in the October 2026 audit. Each is now answered from the files that
// actually configure the practice: Terraform, Alertmanager and Prometheus rules,
// workflow files, dependency manifests, docs and source.
//
// The rule every check here follows: a practice FOUND in the repository is a PASS
// with the files named. A practice NOT found is INCONCLUSIVE, never a WARN, because
// most teams configure paging, budgets and uptime checks in the vendor's own
// dashboard, which leaves no file. The only adverse verdicts are defects the files
// themselves show (a CloudWatch log group with no retention, an AI route with no
// rate limiter in a repository that has none anywhere).
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES, type CheckCategory } from "./categories";
import { stripYamlComments, workflowFiles } from "./ci-workflows";
import { isVendoredPath, sampleCoverage, type RepoSnapshot } from "./native-mobile";

export const REPO_OPERATIONS_KEYS = [
  "alert_pagerduty_opsgenie",
  "on_call_configured",
  "alert_escalation",
  "cost_monitoring_signals",
  "log_aggregation",
  "log_retention_policy",
  "post_mortem_culture",
  "synthetic_monitoring",
  "screen_reader_tested_signal",
  "ai_endpoint_rate_limited",
  "email_preview_configured",
] as const;
type Key = (typeof REPO_OPERATIONS_KEYS)[number];

const LABELS: Record<Key, string> = {
  alert_pagerduty_opsgenie: "Alerts are configured in code",
  on_call_configured: "An on-call schedule is configured in code",
  alert_escalation: "Alerts have an escalation policy in code",
  cost_monitoring_signals: "Cloud spend has a budget alert in code",
  log_aggregation: "Logs are shipped to a log store",
  log_retention_policy: "Log retention is set",
  post_mortem_culture: "Incident reviews are kept in the repository",
  synthetic_monitoring: "Production is checked by synthetic tests",
  screen_reader_tested_signal: "Accessibility is tested automatically",
  ai_endpoint_rate_limited: "AI endpoints are rate limited",
  email_preview_configured: "Email templates set preview text",
};

const CATEGORY: Record<Key, CheckCategory> = {
  alert_pagerduty_opsgenie: CATEGORIES.OBSERVABILITY,
  on_call_configured: CATEGORIES.OBSERVABILITY,
  alert_escalation: CATEGORIES.OBSERVABILITY,
  cost_monitoring_signals: CATEGORIES.OBSERVABILITY,
  log_aggregation: CATEGORIES.OBSERVABILITY,
  log_retention_policy: CATEGORIES.OBSERVABILITY,
  post_mortem_culture: CATEGORIES.OBSERVABILITY,
  synthetic_monitoring: CATEGORIES.OBSERVABILITY,
  screen_reader_tested_signal: CATEGORIES.ACCESSIBILITY,
  ai_endpoint_rate_limited: CATEGORIES.AI_SAFETY,
  email_preview_configured: CATEGORIES.EMAIL,
};

function row(
  key: Key,
  status: PulseScanCheckInput["status"],
  detail: string,
  confidence: "HIGH" | "MEDIUM" | "LOW",
  evidence?: unknown,
): PulseScanCheckInput {
  return {
    category: CATEGORY[key],
    checkKey: key,
    label: LABELS[key],
    status,
    detail,
    confidence,
    ...(status === "PASS" || status === "FAIL" || status === "WARN" ? { evidenceStrength: "VERIFIED" as const } : {}),
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 600) } : {}),
  };
}

/** Comment-stripped text of the files read, keyed by path. Vendored trees are never the project's own. */
function ownFiles(snapshot: RepoSnapshot): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const [path, raw] of snapshot.files) {
    if (isVendoredPath(path)) continue;
    let text = raw;
    if (/\.(tf|hcl)$/i.test(path)) text = raw.replace(/^\s*(#|\/\/).*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    else if (/\.ya?ml$/i.test(path)) text = stripYamlComments(raw);
    out.push({ path, text });
  }
  return out;
}

/** Files whose text matches, with the first match quoted. */
function find(files: { path: string; text: string }[], re: RegExp, pathFilter?: RegExp): { path: string; match: string }[] {
  const hits: { path: string; match: string }[] = [];
  for (const f of files) {
    if (pathFilter && !pathFilter.test(f.path)) continue;
    const m = re.exec(f.text);
    if (m) hits.push({ path: f.path, match: m[0].slice(0, 80) });
  }
  return hits;
}

const named = (hits: { path: string; match: string }[]) =>
  hits.slice(0, 4).map((h) => `${h.path} (${h.match.trim()})`).join(", ");

const TF = /\.(tf|tf\.json)$/i;
const MANIFEST = /(^|\/)(package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml|Gemfile|go\.mod|composer\.json|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml|pubspec\.ya?ml|Podfile|Package\.swift)$/i;

// ─── Alerting, on-call, escalation ───────────────────────────────────────────

const ALERT_TF = /resource\s+"(pagerduty_service|pagerduty_service_integration|opsgenie_[a-z_]+|datadog_monitor|aws_cloudwatch_metric_alarm|google_monitoring_alert_policy|azurerm_monitor_(?:metric|activity_log|scheduled_query_rules)_alert[a-z_]*|grafana_rule_group|grafana_contact_point|newrelic_alert_policy|newrelic_nrql_alert_condition|sentry_issue_alert|sentry_metric_alert|betteruptime_[a-z_]+|incident_alert_[a-z_]+)"/;
const ALERTMANAGER_RECEIVER = /\b(pagerduty_configs|opsgenie_configs|slack_configs|webhook_configs|email_configs|msteams_configs|telegram_configs)\s*:/;
const PROM_RULE = /^\s*-\s*alert\s*:\s*\S+/m;
const PROM_RULE_KIND = /\bkind\s*:\s*PrometheusRule\b/;

const ONCALL_TF = /resource\s+"(pagerduty_schedule|opsgenie_schedule|opsgenie_schedule_rotation|grafana_oncall_schedule|grafana_oncall_on_call_shift|incident_schedule|rootly_schedule|firehydrant_on_call_schedule)"/;
const ESCALATION_TF = /resource\s+"(pagerduty_escalation_policy|opsgenie_escalation|grafana_oncall_escalation_chain|grafana_oncall_escalation|incident_escalation_path|rootly_escalation_policy)"/;

const NOT_IN_CODE = (what: string, where: string) =>
  `No ${what} was found in the repository. Most teams set this up in ${where} rather than in code, so this does not show it is missing; it only means Pulse cannot confirm it.`;

// ─── Cost ────────────────────────────────────────────────────────────────────

const BUDGET_TF = /resource\s+"(aws_budgets_budget|aws_budgets_budget_action|aws_ce_anomaly_monitor|aws_ce_anomaly_subscription|google_billing_budget|azurerm_consumption_budget_[a-z_]+|digitalocean_[a-z_]*budget[a-z_]*)"/;
const INFRACOST = /\binfracost\b/i;

// ─── Logs ────────────────────────────────────────────────────────────────────

const LOG_SHIPPER_DEP =
  /["'](@logtail\/[\w-]+|@axiomhq\/[\w-]+|winston-cloudwatch|pino-cloudwatch|@google-cloud\/logging[\w-]*|datadog-winston|pino-datadog(?:-transport)?|@datadog\/pino|logzio-nodejs|winston-logzio|@betterstack\/[\w-]+|winston-papertrail|winston-loggly-bulk|winston-loki|pino-loki|@opentelemetry\/exporter-logs-[\w-]+|@elastic\/ecs-winston-format|winston-elasticsearch|pino-elasticsearch)["']|^\s*(watchtower|python-logstash|logtail-python|google-cloud-logging|python-json-logger\[?.*\]?.*loki|logging-loki|datadog-logger|structlog-sentry)\b|\bgem\s+["'](logstash-logger|lograge-logstash|logtail-rails|google-cloud-logging)["']/im;
const LOG_SHIPPER_CONFIG = /(^|\/)(fluent-?bit[\w.-]*\.(conf|ya?ml)|fluentd?\.conf|td-agent\.conf|vector\.(toml|ya?ml)|promtail[\w.-]*\.ya?ml|otel(?:-collector)?[\w.-]*\.ya?ml|filebeat\.ya?ml|datadog\.ya?ml)$/i;
const COMPOSE_LOG_DRIVER = /logging\s*:\s*\n\s+driver\s*:\s*["']?(awslogs|gcplogs|fluentd|splunk|loki|gelf|syslog|logentries|azure_logs?)/;
const LOG_STORE_TF = /resource\s+"(aws_cloudwatch_log_group|aws_cloudwatch_log_subscription_filter|google_logging_[a-z_]+|azurerm_log_analytics_workspace|datadog_logs_[a-z_]+|aws_kinesis_firehose_delivery_stream)"/;

/** Every `resource "aws_cloudwatch_log_group" "x" { … }` block, with whether it sets a retention. */
export function cloudwatchLogGroups(tf: string): { name: string; retained: boolean }[] {
  const out: { name: string; retained: boolean }[] = [];
  const re = /resource\s+"aws_cloudwatch_log_group"\s+"([^"]+)"\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tf))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < tf.length && depth > 0) {
      if (tf[i] === "{") depth++;
      else if (tf[i] === "}") depth--;
      i++;
    }
    const body = tf.slice(re.lastIndex, i - 1);
    // retention_in_days = 0 means "never expire" in the AWS API, the same as leaving it out.
    const days = /\bretention_in_days\s*=\s*(\S+)/.exec(body)?.[1];
    out.push({ name: m[1], retained: days !== undefined && days !== "0" });
  }
  return out;
}

const RETENTION_SET = /\bretention_days\s*=\s*\d+|\bretention_in_days\s*=\s*[1-9]|\blogRetentionInDays\s*:\s*\d+|\blogRetention\s*:\s*(?:logs\.)?RetentionDays\.\w+|\bretention\s*:\s*(?:logs\.)?RetentionDays\.(?!INFINITE)\w+/;

// ─── Incident reviews ────────────────────────────────────────────────────────

const POSTMORTEM_DOC = /(^|\/)(post-?mortems?|postmortems?|incident[-_]?reviews?|incident[-_]?reports?|retrospectives?|rcas?)\/[^/]+\.(md|mdx|rst|adoc|txt)$|(^|\/)(POSTMORTEM|POST-MORTEM|INCIDENT[-_]REVIEW)[^/]*\.(md|mdx)$|(^|\/)docs?\/(?:[^/]+\/)*incidents?\/[^/]+\.(md|mdx)$|^\.github\/ISSUE_TEMPLATE\/[^/]*(incident|post-?mortem)[^/]*\.(md|ya?ml)$/i;

// ─── Synthetic monitoring ────────────────────────────────────────────────────

const SYNTHETIC_PATH = /(^|\/)checkly\.config\.(ts|js|mjs|cjs)$|(^|\/)__checks__\/|\.check\.(ts|js)$|(^|\/)\.?datadog\/synthetics\//i;
const SYNTHETIC_TF = /resource\s+"(datadog_synthetics_test|aws_synthetics_canary|google_monitoring_uptime_check_config|betteruptime_monitor|uptimerobot_monitor|pingdom_check|newrelic_synthetics_[a-z_]+|grafana_synthetic_monitoring_check|statuscake_uptime_check|checkly_check|checkly_check_group|azurerm_application_insights_standard_web_test)"/;
/** A scheduled workflow that actually exercises something (a browser test, a load test or an HTTP probe). */
const SCHEDULED = /^\s*schedule\s*:\s*\n\s*-\s*cron\s*:/m;
const EXERCISES = /\b(playwright\s+test|npx\s+playwright|cypress\s+run|k6\s+run|newman\s+run|curl\s+[^\n]*(--fail|-f\b|-sf)|wget\s+--spider|lhci\s+autorun|checkly\s+test)/i;

// ─── Accessibility tests ─────────────────────────────────────────────────────

const A11Y_TEST_DEP =
  /["'](jest-axe|vitest-axe|@axe-core\/playwright|@axe-core\/webdriverjs|@axe-core\/puppeteer|@axe-core\/react|axe-playwright|cypress-axe|pa11y|pa11y-ci|@storybook\/test-runner-a11y|axe-core|@testing-library\/jest-dom-axe|lighthouse-ci|@lhci\/cli)["']\s*:/;
const A11Y_TEST_SOURCE =
  /\bperformAccessibilityAudit\s*\(|\bAccessibilityChecks\.enable\s*\(|com\.google\.android\.apps\.common\.testing\.accessibility|\bmeetsGuideline\s*\(|\btoHaveNoViolations\b|\bcheckA11y\s*\(|\bAxeBuilder\b|\binjectAxe\s*\(/;
const A11Y_TEST_MANIFEST_OTHER = /accessibility-test-framework|espresso-accessibility|\baxe-selenium\b|\baxe-core-maven\b|\bpytest-axe\b|\baxe-playwright-python\b|\baxe-selenium-python\b/i;
const LIGHTHOUSE_A11Y = /["']?categories:accessibility["']?\s*:|["']accessibility["']\s*:\s*\[\s*["'](error|warn)/;

// ─── AI endpoints ────────────────────────────────────────────────────────────

/** A server-side call to a model provider: an SDK import or a provider API host. */
const LLM_SERVER_CALL =
  /from\s+["'](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|@mistralai\/mistralai|cohere-ai|groq-sdk|ai|@ai-sdk\/[\w-]+|langchain|@langchain\/[\w-]+|replicate|together-ai)["']|require\(\s*["'](openai|@anthropic-ai\/sdk|@google\/generative-ai)["']\s*\)|^\s*(?:from|import)\s+(openai|anthropic|google\.generativeai|mistralai|cohere|groq|litellm|langchain)\b|https:\/\/api\.(openai|anthropic|mistral|groq|cohere)\.(com|ai)\//m;
/** A file that handles HTTP requests (a route handler, API route, controller or view). */
const ROUTE_FILE =
  /^(?:app\/.*\/route\.(ts|js)|.*\/app\/.*\/route\.(ts|js)|(?:.*\/)?pages\/api\/|(?:.*\/)?api\/|(?:.*\/)?routes?\/|(?:.*\/)?controllers?\/|(?:.*\/)?handlers?\/|.*views\.py$|.*urls\.py$|(?:src\/)?server\.(ts|js)$|main\.py$|app\.py$)/i;
const RATE_LIMIT =
  /@upstash\/ratelimit|\bRatelimit\b|express-rate-limit|rate-limiter-flexible|\bRateLimiter\w*\b|@fastify\/rate-limit|hono-rate-limiter|\bslowapi\b|\bLimiter\s*\(\s*key_func|django[-_]ratelimit|@ratelimit\b|\bthrottle_classes\b|Rack::Attack|@nestjs\/throttler|ThrottlerGuard|\blimit_req_zone\b|\bunkey\b|@arcjet\/|\bslidingWindow\s*\(|\bfixedWindow\s*\(|\btokenBucket\s*\(|[\w$]*rate[-_]?limit[\w$]*\s*\(|[\w$]*throttle[\w$]*\s*\(|from\s+["'][^"']*rate[-_]?limit[^"']*["']|\bmax\w*Per(?:Minute|Hour|Day)\b/i;
const RATE_LIMIT_DEP =
  /["'](@upstash\/ratelimit|express-rate-limit|rate-limiter-flexible|@fastify\/rate-limit|hono-rate-limiter|@nestjs\/throttler|@unkey\/[\w-]+|@arcjet\/[\w-]+|limiter|bottleneck)["']\s*:|^\s*(slowapi|django-ratelimit|flask-limiter|fastapi-limiter)\b|\bgem\s+["']rack-attack["']/im;
/** Global middleware that every request (or every API request) passes through. */
const GLOBAL_MIDDLEWARE = /(^|\/)(middleware\.(ts|js)|src\/middleware\.(ts|js)|server\.(ts|js)|app\.(ts|js)|index\.(ts|js)|main\.(ts|js)|settings\.py|nginx\.conf|default\.conf)$/i;

// ─── Email templates ─────────────────────────────────────────────────────────

/** Anything under an email folder (or Rails mailer views). */
const EMAIL_DIR =
  /(^|\/)(emails?|mails?|mailers?|email[-_]?templates?|templates\/emails?|transactional)\/(?:[^/]+\/)*[^/]+\.(tsx|jsx|mjml|hbs|handlebars|html?|liquid|njk|erb|blade\.php)$|\.mjml$|(^|\/)app\/views\/[^/]+_mailer\/[^/]+\.html\.erb$/i;
/** Not a template: tests, the React Email preview app, and building blocks. */
const NOT_A_TEMPLATE = /(^|\/)(__tests__|tests?|fixtures?|examples?|node_modules|preview|\.react-email|storybook)\/|\.(test|spec|stories)\.[jt]sx?$/i;
/** Shared layouts, where a preheader is usually set once for every email. */
const EMAIL_LAYOUT = /(^|\/)app\/views\/layouts\/mailer[^/]*\.erb$|(^|\/)(emails?|mails?|mailers?|email[-_]?templates?)\/(?:[^/]+\/)*(layouts?|_layouts?|base|wrapper|shell)[^/]*\.(tsx|jsx|mjml|hbs|handlebars|html?|liquid|njk|erb|blade\.php)$|(^|\/)(emails?|mails?)\/(?:[^/]+\/)*(_?components?|partials?)\/(?:[^/]*(?:layout|base|wrapper|shell)[^/]*)\.(tsx|jsx)$/i;
const IS_COMPONENT = /(^|\/)(_?components?|partials?|ui)\//i;

export function classifyEmailPaths(paths: string[]): { templates: string[]; layouts: string[] } {
  const templates: string[] = [];
  const layouts: string[] = [];
  for (const p of paths) {
    if (isVendoredPath(p) || NOT_A_TEMPLATE.test(p)) continue;
    if (EMAIL_LAYOUT.test(p)) layouts.push(p);
    else if (EMAIL_DIR.test(p) && !IS_COMPONENT.test(p)) templates.push(p);
  }
  return { templates, layouts };
}

const PREVIEW_TEXT =
  /<Preview\b|<mj-preview\b|\bpreheader\b|\bpreview-?text\b|\bpreviewText\b|display\s*:\s*none[^"'>]{0,120}(max-height|mso-hide)|mso-hide\s*:\s*all/i;

/** Evaluate every operations practice against the repository snapshot. Pure. */
export function evaluateRepoOperationsChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const files = ownFiles(snapshot);
  const paths = snapshot.paths.filter((p) => !isVendoredPath(p));
  const out: PulseScanCheckInput[] = [];

  // Alerting.
  const alertHits = [
    ...find(files, ALERT_TF, TF),
    ...find(files, ALERTMANAGER_RECEIVER, /\.ya?ml$/i),
    ...find(files, PROM_RULE, /\.ya?ml$/i).filter((h) => !/\.github\/workflows\//.test(h.path)),
    ...find(files, PROM_RULE_KIND, /\.ya?ml$/i),
  ];
  out.push(alertHits.length > 0
    ? row("alert_pagerduty_opsgenie", "PASS", `Alerting is defined in code: ${named(alertHits)}.`, "HIGH", alertHits.slice(0, 6))
    : row("alert_pagerduty_opsgenie", "INCONCLUSIVE", NOT_IN_CODE("alerting configuration (Terraform monitors, Alertmanager receivers or Prometheus alert rules)", "the monitoring tool's own dashboard (Sentry, Datadog, Better Stack, Grafana)"), "LOW"));

  const oncallHits = find(files, ONCALL_TF, TF);
  out.push(oncallHits.length > 0
    ? row("on_call_configured", "PASS", `An on-call schedule is defined in code: ${named(oncallHits)}.`, "HIGH", oncallHits.slice(0, 6))
    : row("on_call_configured", "INCONCLUSIVE", NOT_IN_CODE("on-call schedule", "the paging tool (PagerDuty, Opsgenie, incident.io)"), "LOW"));

  const escalationHits = find(files, ESCALATION_TF, TF);
  out.push(escalationHits.length > 0
    ? row("alert_escalation", "PASS", `An escalation policy is defined in code: ${named(escalationHits)}.`, "HIGH", escalationHits.slice(0, 6))
    : row("alert_escalation", "INCONCLUSIVE", NOT_IN_CODE("escalation policy", "the paging tool (PagerDuty, Opsgenie, incident.io)"), "LOW"));

  // Cloud cost.
  const budgetHits = [...find(files, BUDGET_TF, TF), ...find(files, INFRACOST, /^\.github\/workflows\//)];
  out.push(budgetHits.length > 0
    ? row("cost_monitoring_signals", "PASS", `Cloud spend is watched from code: ${named(budgetHits)}.`, "HIGH", budgetHits.slice(0, 6))
    : row("cost_monitoring_signals", "INCONCLUSIVE", NOT_IN_CODE("budget alert or cost check", "the cloud provider's billing console"), "LOW"));

  // Log shipping.
  const shipHits = [
    ...find(files, LOG_SHIPPER_DEP, MANIFEST),
    ...paths.filter((p) => LOG_SHIPPER_CONFIG.test(p)).map((p) => ({ path: p, match: "log shipper config" })),
    ...find(files, COMPOSE_LOG_DRIVER, /(docker-)?compose[^/]*\.ya?ml$/i),
    ...find(files, LOG_STORE_TF, TF),
  ];
  out.push(shipHits.length > 0
    ? row("log_aggregation", "PASS", `Logs are sent to a log store: ${named(shipHits)}.`, "HIGH", shipHits.slice(0, 6))
    : row("log_aggregation", "INCONCLUSIVE", NOT_IN_CODE("log shipping (a logging transport, a log shipper's config or a log store in Terraform)", "the hosting platform's log drain settings"), "LOW"));

  // Log retention: the one adverse verdict a file can prove.
  const tfText = files.filter((f) => TF.test(f.path));
  const groups = tfText.flatMap((f) => cloudwatchLogGroups(f.text).map((g) => ({ ...g, path: f.path })));
  const unretained = groups.filter((g) => !g.retained);
  const retentionHits = [...find(files, RETENTION_SET), ...groups.filter((g) => g.retained).map((g) => ({ path: g.path, match: `aws_cloudwatch_log_group.${g.name}` }))];
  if (unretained.length > 0) {
    out.push(row(
      "log_retention_policy",
      "WARN",
      `${unretained.length === 1 ? "A CloudWatch log group sets" : `${unretained.length} CloudWatch log groups set`} no retention_in_days, so CloudWatch keeps ${unretained.length === 1 ? "its" : "their"} logs forever: ` +
        `${unretained.slice(0, 4).map((g) => `aws_cloudwatch_log_group.${g.name} in ${g.path}`).join(", ")}. ` +
        "Logs usually hold personal data (IP addresses, emails, user ids), and keeping them indefinitely breaches the GDPR storage-limitation principle and grows the bill every month. Set retention_in_days to the period you need.",
      "HIGH",
      unretained.slice(0, 6),
    ));
  } else if (retentionHits.length > 0) {
    out.push(row("log_retention_policy", "PASS", `Log retention is set in code: ${named(retentionHits)}.`, "HIGH", retentionHits.slice(0, 6)));
  } else {
    out.push(row("log_retention_policy", "INCONCLUSIVE", NOT_IN_CODE("log store with a retention period", "the log tool or hosting platform"), "LOW"));
  }

  // Incident reviews.
  const reviews = paths.filter((p) => POSTMORTEM_DOC.test(p) && !/(^|\/)(src|app|lib|components|packages\/[^/]+\/src)\//i.test(p));
  out.push(reviews.length > 0
    ? row("post_mortem_culture", "PASS", `Incident reviews are written down in the repository: ${reviews.slice(0, 4).join(", ")}${reviews.length > 4 ? ` and ${reviews.length - 4} more` : ""}.`, "HIGH", reviews.slice(0, 6))
    : row("post_mortem_culture", "INCONCLUSIVE", NOT_IN_CODE("incident review or postmortem", "a wiki or incident tool"), "LOW"));

  // Synthetic monitoring.
  const scheduled = workflowFiles(snapshot)
    .map((w) => ({ path: w.path, text: stripYamlComments(w.text) }))
    .filter((w) => SCHEDULED.test(w.text) && EXERCISES.test(w.text))
    .map((w) => ({ path: w.path, match: "scheduled workflow" }));
  const syntheticHits = [
    ...paths.filter((p) => SYNTHETIC_PATH.test(p)).slice(0, 4).map((p) => ({ path: p, match: "synthetic check" })),
    ...find(files, SYNTHETIC_TF, TF),
    ...scheduled,
  ];
  out.push(syntheticHits.length > 0
    ? row("synthetic_monitoring", "PASS", `Synthetic checks are defined in code: ${named(syntheticHits)}.`, "HIGH", syntheticHits.slice(0, 6))
    : row("synthetic_monitoring", "INCONCLUSIVE", NOT_IN_CODE("synthetic or uptime check", "an uptime tool's dashboard (Checkly, Better Stack, UptimeRobot)"), "LOW"));

  // Automated accessibility tests.
  const a11yHits = [
    ...find(files, A11Y_TEST_DEP, /(^|\/)package\.json$/i),
    ...find(files, A11Y_TEST_MANIFEST_OTHER, MANIFEST),
    ...find(files, A11Y_TEST_SOURCE),
    ...find(files, LIGHTHOUSE_A11Y, /(^|\/)(lighthouserc[\w.]*|\.lighthouserc[\w.]*)$/i),
  ];
  out.push(a11yHits.length > 0
    ? row("screen_reader_tested_signal", "PASS", `Accessibility is checked by automated tests: ${named(a11yHits)}. Automated checks catch roughly a third of WCAG issues; screen reader testing by a person is still needed for the rest.`, "HIGH", a11yHits.slice(0, 6))
    : row("screen_reader_tested_signal", "INCONCLUSIVE", "No automated accessibility testing (axe, pa11y, Storybook a11y, XCUITest audits, Android accessibility checks) was found in the files Pulse read. Testing with a screen reader by hand leaves no file, so this does not show accessibility is untested.", "LOW"));

  // AI endpoint rate limiting.
  out.push(aiRateLimitCheck(snapshot, files));

  // Email preview text. A preheader is usually set once in a shared layout, so a WARN needs
  // every template AND every layout to have been read; anything less leaves it open.
  const { templates, layouts } = classifyEmailPaths(paths);
  if (templates.length === 0) {
    out.push(row("email_preview_configured", "SKIPPED", "No email templates were found in the repository.", "HIGH"));
  } else {
    const read = [...templates, ...layouts].filter((p) => snapshot.files.has(p));
    const withPreview = read.filter((p) => PREVIEW_TEXT.test(snapshot.files.get(p) ?? ""));
    const allRead = read.length === templates.length + layouts.length;
    if (withPreview.length > 0) {
      out.push(row("email_preview_configured", "PASS", `Email templates set preview text: ${withPreview.slice(0, 4).join(", ")}.`, "HIGH", withPreview.slice(0, 6)));
    } else if (allRead) {
      out.push(row(
        "email_preview_configured",
        "WARN",
        `None of the ${templates.length} email template${templates.length === 1 ? "" : "s"}${layouts.length ? ` or ${layouts.length} layout${layouts.length === 1 ? "" : "s"}` : ""} sets preview text (${templates.slice(0, 4).join(", ")}). ` +
          "Without it, inboxes show the first words of the body beside the subject, which is often a logo's alt text or 'View in browser'. Add a <Preview> (React Email), <mj-preview> (MJML) or a hidden preheader.",
        "MEDIUM",
        templates.slice(0, 6),
      ));
    } else {
      out.push(row("email_preview_configured", "INCONCLUSIVE", `Pulse read ${read.length} of the ${templates.length + layouts.length} email templates and layouts and found no preview text in them, but a shared layout or a template it did not read may set one.`, "LOW"));
    }
  }

  return out;
}

/**
 * Server files that call a model, and whether a rate limiter guards them.
 *
 * A limiter counts when it is in the same file, or in global middleware every request
 * passes through. A WARN needs all of: an AI route file was read, no limiter is used
 * anywhere in the code read, no rate-limit library is a dependency, and enough of the
 * source was read for "nowhere" to mean something. Anything less is INCONCLUSIVE, since
 * a gateway or WAF (Cloudflare, API Gateway) can limit without leaving a file.
 */
function aiRateLimitCheck(snapshot: RepoSnapshot, files: { path: string; text: string }[]): PulseScanCheckInput {
  const source = files.filter((f) => /\.(ts|tsx|js|mjs|cjs|py|rb|go|php)$/i.test(f.path) && !/(^|\/)(__tests__|tests?|spec|e2e|fixtures?|scripts)\//i.test(f.path) && !/\.(test|spec)\./i.test(f.path));
  const aiRoutes = source.filter((f) => ROUTE_FILE.test(f.path) && LLM_SERVER_CALL.test(f.text));
  if (aiRoutes.length === 0) {
    return row("ai_endpoint_rate_limited", "SKIPPED", "No server route that calls a model provider was found in the files Pulse read.", "MEDIUM");
  }
  const guarded = aiRoutes.filter((f) => RATE_LIMIT.test(f.text));
  const global = files.filter((f) => GLOBAL_MIDDLEWARE.test(f.path) && RATE_LIMIT.test(f.text));
  if (guarded.length === aiRoutes.length || global.length > 0) {
    const where = global.length > 0 ? `global middleware (${global.slice(0, 2).map((f) => f.path).join(", ")})` : guarded.slice(0, 3).map((f) => f.path).join(", ");
    return row("ai_endpoint_rate_limited", "PASS", `Routes that call a model are rate limited in ${where}.`, "MEDIUM", { aiRoutes: aiRoutes.slice(0, 6).map((f) => f.path) });
  }
  const unguarded = aiRoutes.filter((f) => !RATE_LIMIT.test(f.text));
  const limiterAnywhere = source.some((f) => RATE_LIMIT.test(f.text)) || files.some((f) => MANIFEST.test(f.path) && RATE_LIMIT_DEP.test(f.text));
  const totalSource = snapshot.paths.filter((p) => /\.(ts|tsx|js|mjs|cjs|py|rb|go|php)$/i.test(p) && !isVendoredPath(p)).length;
  const coverage = sampleCoverage(source.length, totalSource, snapshot.truncated);
  const list = unguarded.slice(0, 4).map((f) => f.path).join(", ");
  if (limiterAnywhere || coverage < 0.3) {
    return row(
      "ai_endpoint_rate_limited",
      "INCONCLUSIVE",
      `${unguarded.length === 1 ? "A route that calls" : `${unguarded.length} routes that call`} a model (${list}) ${unguarded.length === 1 ? "has" : "have"} no rate limiter in the file itself. ` +
        (limiterAnywhere
          ? "A rate limiter is used elsewhere in the project, possibly in shared middleware Pulse did not tie to these routes, so this cannot be settled from the files read."
          : `Pulse read ${Math.round(coverage * 100)}% of the source, too little to say no limiter exists anywhere.`),
      "LOW",
      { unguarded: unguarded.slice(0, 6).map((f) => f.path) },
    );
  }
  return row(
    "ai_endpoint_rate_limited",
    "WARN",
    `${unguarded.length === 1 ? "A route that calls" : `${unguarded.length} routes that call`} a model (${list}) ${unguarded.length === 1 ? "has" : "have"} no rate limiter, and the project uses no rate-limiting library anywhere. ` +
      "Each request spends money with the model provider, so an unlimited endpoint lets one script run up the bill or exhaust your quota. Add a per-user or per-IP limit (Upstash Ratelimit, express-rate-limit, slowapi), unless your gateway or WAF already limits these paths.",
    "MEDIUM",
    { unguarded: unguarded.slice(0, 6).map((f) => f.path) },
  );
}

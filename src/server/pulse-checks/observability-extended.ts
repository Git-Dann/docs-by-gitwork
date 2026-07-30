import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

export async function runObservabilityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasAlerts = /pagerduty|opsgenie|victorops|alertmanager|alerting.*configured/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "alert_pagerduty_opsgenie", label: "PagerDuty / OpsGenie / alerting configured", status: hasAlerts ? "PASS" : "WARN", detail: hasAlerts ? "Alerting platform signals detected." : "No alerting platform signals — configure PagerDuty, OpsGenie, or similar to ensure critical incidents page the on-call team." });

  const hasOnCall = /on.call|on-call rotation|incident.*response|pagerduty|opsgenie/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "on_call_configured", label: "On-call rotation configured", status: hasOnCall ? "PASS" : "WARN", detail: hasOnCall ? "On-call rotation signals detected." : "No on-call rotation signals — define a formal on-call schedule before going to production." });

  const hasTracing = /jaeger|zipkin|datadog.*trac|opentelemetry|distributed.*trac|tracing.*id|trace.*id/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "distributed_tracing", label: "Distributed tracing configured", status: hasTracing ? "PASS" : "WARN", detail: hasTracing ? "Distributed tracing signals detected (Jaeger / Zipkin / OpenTelemetry)." : "No distributed tracing detected — tracing is essential for diagnosing latency issues in microservices and async architectures." });

  const hasCustomMetrics = /custom.*dashboard|business.*metric|kpi.*dashboard|grafana|datadog.*dashboard/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "custom_business_metrics", label: "Custom business metrics / dashboards", status: hasCustomMetrics ? "PASS" : "WARN", detail: hasCustomMetrics ? "Custom metrics / dashboard signals detected." : "No custom business metrics signals — instrument key business events (signups, conversions, churn) beyond infrastructure metrics." });

  const hasSynthetic = /checkly|pingdom|updown\.io|statuscake|site24x7|synthetic.*monitor|uptime.*robot/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "synthetic_monitoring", label: "Synthetic monitoring (uptime checks)", status: hasSynthetic ? "PASS" : "WARN", detail: hasSynthetic ? "Synthetic monitoring signals detected." : "No synthetic monitoring detected — use Checkly, Pingdom, or similar to run continuous end-to-end checks and catch issues before users do." });

  const hasStructuredLogs = /json.*log|structured.*log|log.*format.*json|bunyan|winston|pino|logfmt/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "structured_logging", label: "Structured / JSON logging", status: hasStructuredLogs ? "PASS" : "WARN", detail: hasStructuredLogs ? "Structured logging signals detected." : "No structured logging signals — JSON-structured logs are machine-parseable and enable powerful log queries in Datadog, CloudWatch, and similar." });

  const hasLogRetention = /log.*retention|retain.*log|log.*policy|30.*day.*log|90.*day.*log/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "log_retention_policy", label: "Log retention policy configured", status: hasLogRetention ? "PASS" : "WARN", detail: hasLogRetention ? "Log retention policy signals detected." : "No log retention policy signals — define how long logs are retained; many compliance frameworks require 90+ days." });

  const hasAuditLogApi = /audit.*log.*api|export.*audit|audit.*export|programmatic.*audit/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "audit_log_api_export", label: "Audit log accessible via API", status: hasAuditLogApi ? "PASS" : "WARN", detail: hasAuditLogApi ? "Audit log API / export signals detected." : "No audit log API signals — enterprise customers need to export audit logs to their own SIEM." });

  const hasDbMonitor = /planetscale|datadog.*database|pganalyze|percona|slow.*query|database.*monitor|query.*performance/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "db_performance_monitoring", label: "Database performance monitoring", status: hasDbMonitor ? "PASS" : "WARN", detail: hasDbMonitor ? "Database performance monitoring signals detected." : "No database monitoring signals — slow queries are a top cause of production incidents; use pganalyze, Datadog DBM, or similar." });

  const hasQueueMonitor = /queue.*depth|dead.*letter|dlq|queue.*monitor|message.*queue.*monitor|bull.*dashboard|horizon/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "queue_depth_monitoring", label: "Message queue depth monitoring", status: hasQueueMonitor ? "PASS" : "WARN", detail: hasQueueMonitor ? "Queue monitoring signals detected." : "No queue monitoring signals — monitor queue depth and dead-letter queues to detect processing backlogs early." });

  const hasCostMonitor = /aws.*budget|cost.*alert|cost.*monitor|cloud.*cost|billing.*alert|spend.*alert/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "cost_monitoring_signals", label: "Cloud cost alerting", status: hasCostMonitor ? "PASS" : "WARN", detail: hasCostMonitor ? "Cloud cost monitoring signals detected." : "No cost monitoring signals — configure budget alerts to catch runaway infrastructure costs before they become bills." });

  const hasErrorBudget = /error.*budget|slo|service.*level.*objective|reliability.*target|99\.9|99\.99/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "error_budget_policy", label: "SLO / error budget policy", status: hasErrorBudget ? "PASS" : "WARN", detail: hasErrorBudget ? "SLO / error budget signals detected." : "No SLO signals — define Service Level Objectives and error budgets to balance reliability work against feature development." });

  const hasRunbooks = /runbook|playbook|incident.*guide|on.call.*guide|incident.*runbook/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "incident_runbooks", label: "Incident runbooks / playbooks", status: hasRunbooks ? "PASS" : "WARN", detail: hasRunbooks ? "Runbook / playbook signals detected." : "No runbooks detected — documented runbooks reduce MTTR and enable junior engineers to handle incidents confidently." });

  const hasPostMortem = /post.mortem|postmortem|blameless.*review|incident.*review|root.*cause.*analysis/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "post_mortem_culture", label: "Post-mortem / incident review culture", status: hasPostMortem ? "PASS" : "WARN", detail: hasPostMortem ? "Post-mortem / blameless review signals detected." : "No post-mortem signals — a blameless post-mortem culture prevents incident recurrence and builds reliability expertise." });

  const hasDeployFreq = /dora.*metric|deploy.*frequency|deployment.*frequency|lead.*time|change.*fail|mean.*time.*recover/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "deployment_frequency_tracking", label: "Deployment frequency / DORA metrics tracked", status: hasDeployFreq ? "PASS" : "WARN", detail: hasDeployFreq ? "DORA metric signals detected." : "No deployment frequency tracking — DORA metrics (deploy frequency, lead time, change fail rate, MTTR) are the industry standard for engineering performance." });

  const hasStatusPage = /href=["']https?:\/\/[^"']*(?:status|uptime)[^"']*["']|system status|service status/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "public_status_page", label: "Public service status page", status: hasStatusPage ? "PASS" : "WARN", detail: hasStatusPage ? "A public status or uptime page is linked." : "No public status page was observed. Publish current component health and incident history so customers can self-diagnose outages." });

  const hasIncidentSubscriptions = /subscribe.{0,40}(?:incident|status|outage)|(?:incident|status) updates|notify me.{0,30}(?:incident|outage)/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "incident_subscriptions", label: "Customers can subscribe to incident updates", status: hasIncidentSubscriptions ? "PASS" : "WARN", detail: hasIncidentSubscriptions ? "Incident-update subscription evidence detected." : "No incident subscription mechanism was observed. Let customers opt into outage and recovery notifications instead of repeatedly checking a page." });

  const hasTraceCorrelation = /trace[\s_-]*id|correlation[\s_-]*id|request[\s_-]*id|traceparent/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "trace_correlation", label: "Requests expose trace or correlation identifiers", status: hasTraceCorrelation ? "PASS" : "WARN", detail: hasTraceCorrelation ? "Trace/correlation identifier evidence detected." : "No trace or correlation identifier signal was observed. Carry one identifier through logs and responses so a customer report maps to a single request path." });

  const hasReleaseHealth = /release health|deploy(?:ment)?.{0,30}(?:error|regression|health)|errors?.{0,30}(?:release|version|commit)/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "release_health", label: "Errors are correlated with releases", status: hasReleaseHealth ? "PASS" : "WARN", detail: hasReleaseHealth ? "Release-health monitoring evidence detected." : "No release-health signal was observed. Tag telemetry with release or commit identifiers so regressions can be tied to a deployment quickly." });

  const hasEscalation = /escalation policy|secondary on.call|backup on.call|escalat.{0,30}(?:pager|incident|alert)/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "alert_escalation", label: "Alerts have an escalation path", status: hasEscalation ? "PASS" : "WARN", detail: hasEscalation ? "Alert escalation evidence detected." : "No alert escalation path was observed. Critical alerts need a timed secondary route when the primary responder does not acknowledge them." });

  return checks;
}

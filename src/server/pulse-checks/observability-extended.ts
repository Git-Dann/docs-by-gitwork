import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

export async function runObservabilityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasAlerts = /pagerduty|opsgenie|victorops|alertmanager|alerting.*configured/i.test(html);
  checks.push({ category: "Observability", checkKey: "alert_pagerduty_opsgenie", label: "PagerDuty / OpsGenie / alerting configured", status: hasAlerts ? "PASS" : "WARN", detail: hasAlerts ? "Alerting platform signals detected." : "No alerting platform signals — configure PagerDuty, OpsGenie, or similar to ensure critical incidents page the on-call team." });

  const hasOnCall = /on.call|on-call rotation|incident.*response|pagerduty|opsgenie/i.test(html);
  checks.push({ category: "Observability", checkKey: "on_call_configured", label: "On-call rotation configured", status: hasOnCall ? "PASS" : "WARN", detail: hasOnCall ? "On-call rotation signals detected." : "No on-call rotation signals — define a formal on-call schedule before going to production." });

  const hasTracing = /jaeger|zipkin|datadog.*trac|opentelemetry|distributed.*trac|tracing.*id|trace.*id/i.test(html);
  checks.push({ category: "Observability", checkKey: "distributed_tracing", label: "Distributed tracing configured", status: hasTracing ? "PASS" : "WARN", detail: hasTracing ? "Distributed tracing signals detected (Jaeger / Zipkin / OpenTelemetry)." : "No distributed tracing detected — tracing is essential for diagnosing latency issues in microservices and async architectures." });

  const hasCustomMetrics = /custom.*dashboard|business.*metric|kpi.*dashboard|grafana|datadog.*dashboard/i.test(html);
  checks.push({ category: "Observability", checkKey: "custom_business_metrics", label: "Custom business metrics / dashboards", status: hasCustomMetrics ? "PASS" : "WARN", detail: hasCustomMetrics ? "Custom metrics / dashboard signals detected." : "No custom business metrics signals — instrument key business events (signups, conversions, churn) beyond infrastructure metrics." });

  const hasSynthetic = /checkly|pingdom|updown\.io|statuscake|site24x7|synthetic.*monitor|uptime.*robot/i.test(html);
  checks.push({ category: "Observability", checkKey: "synthetic_monitoring", label: "Synthetic monitoring (uptime checks)", status: hasSynthetic ? "PASS" : "WARN", detail: hasSynthetic ? "Synthetic monitoring signals detected." : "No synthetic monitoring detected — use Checkly, Pingdom, or similar to run continuous end-to-end checks and catch issues before users do." });

  const hasStructuredLogs = /json.*log|structured.*log|log.*format.*json|bunyan|winston|pino|logfmt/i.test(html);
  checks.push({ category: "Observability", checkKey: "structured_logging", label: "Structured / JSON logging", status: hasStructuredLogs ? "PASS" : "WARN", detail: hasStructuredLogs ? "Structured logging signals detected." : "No structured logging signals — JSON-structured logs are machine-parseable and enable powerful log queries in Datadog, CloudWatch, and similar." });

  const hasLogRetention = /log.*retention|retain.*log|log.*policy|30.*day.*log|90.*day.*log/i.test(html);
  checks.push({ category: "Observability", checkKey: "log_retention_policy", label: "Log retention policy configured", status: hasLogRetention ? "PASS" : "WARN", detail: hasLogRetention ? "Log retention policy signals detected." : "No log retention policy signals — define how long logs are retained; many compliance frameworks require 90+ days." });

  const hasAuditLogApi = /audit.*log.*api|export.*audit|audit.*export|programmatic.*audit/i.test(html);
  checks.push({ category: "Observability", checkKey: "audit_log_api_export", label: "Audit log accessible via API", status: hasAuditLogApi ? "PASS" : "WARN", detail: hasAuditLogApi ? "Audit log API / export signals detected." : "No audit log API signals — enterprise customers need to export audit logs to their own SIEM." });

  const hasDbMonitor = /planetscale|datadog.*database|pganalyze|percona|slow.*query|database.*monitor|query.*performance/i.test(html);
  checks.push({ category: "Observability", checkKey: "db_performance_monitoring", label: "Database performance monitoring", status: hasDbMonitor ? "PASS" : "WARN", detail: hasDbMonitor ? "Database performance monitoring signals detected." : "No database monitoring signals — slow queries are a top cause of production incidents; use pganalyze, Datadog DBM, or similar." });

  const hasQueueMonitor = /queue.*depth|dead.*letter|dlq|queue.*monitor|message.*queue.*monitor|bull.*dashboard|horizon/i.test(html);
  checks.push({ category: "Observability", checkKey: "queue_depth_monitoring", label: "Message queue depth monitoring", status: hasQueueMonitor ? "PASS" : "WARN", detail: hasQueueMonitor ? "Queue monitoring signals detected." : "No queue monitoring signals — monitor queue depth and dead-letter queues to detect processing backlogs early." });

  const hasCostMonitor = /aws.*budget|cost.*alert|cost.*monitor|cloud.*cost|billing.*alert|spend.*alert/i.test(html);
  checks.push({ category: "Observability", checkKey: "cost_monitoring_signals", label: "Cloud cost alerting", status: hasCostMonitor ? "PASS" : "WARN", detail: hasCostMonitor ? "Cloud cost monitoring signals detected." : "No cost monitoring signals — configure budget alerts to catch runaway infrastructure costs before they become bills." });

  const hasErrorBudget = /error.*budget|slo|service.*level.*objective|reliability.*target|99\.9|99\.99/i.test(html);
  checks.push({ category: "Observability", checkKey: "error_budget_policy", label: "SLO / error budget policy", status: hasErrorBudget ? "PASS" : "WARN", detail: hasErrorBudget ? "SLO / error budget signals detected." : "No SLO signals — define Service Level Objectives and error budgets to balance reliability work against feature development." });

  const hasRunbooks = /runbook|playbook|incident.*guide|on.call.*guide|incident.*runbook/i.test(html);
  checks.push({ category: "Observability", checkKey: "incident_runbooks", label: "Incident runbooks / playbooks", status: hasRunbooks ? "PASS" : "WARN", detail: hasRunbooks ? "Runbook / playbook signals detected." : "No runbooks detected — documented runbooks reduce MTTR and enable junior engineers to handle incidents confidently." });

  const hasPostMortem = /post.mortem|postmortem|blameless.*review|incident.*review|root.*cause.*analysis/i.test(html);
  checks.push({ category: "Observability", checkKey: "post_mortem_culture", label: "Post-mortem / incident review culture", status: hasPostMortem ? "PASS" : "WARN", detail: hasPostMortem ? "Post-mortem / blameless review signals detected." : "No post-mortem signals — a blameless post-mortem culture prevents incident recurrence and builds reliability expertise." });

  const hasDeployFreq = /dora.*metric|deploy.*frequency|deployment.*frequency|lead.*time|change.*fail|mean.*time.*recover/i.test(html);
  checks.push({ category: "Observability", checkKey: "deployment_frequency_tracking", label: "Deployment frequency / DORA metrics tracked", status: hasDeployFreq ? "PASS" : "WARN", detail: hasDeployFreq ? "DORA metric signals detected." : "No deployment frequency tracking — DORA metrics (deploy frequency, lead time, change fail rate, MTTR) are the industry standard for engineering performance." });

  return checks;
}

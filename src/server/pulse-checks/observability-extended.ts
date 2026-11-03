import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

// Repository practices (alerting, on-call, logging, tracing, SLOs, runbooks) used to be
// guessed here from vendor names in a website's HTML. They are read from the repository
// now (repo-operations.ts, service-depth.ts, operational-depth.ts); this module keeps only
// what a public page genuinely shows.
export async function runObservabilityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasAuditLogApi = /audit.*log.*api|export.*audit|audit.*export|programmatic.*audit/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "audit_log_api_export", label: "Audit log accessible via API", status: hasAuditLogApi ? "PASS" : "WARN", detail: hasAuditLogApi ? "Audit log API / export signals detected." : "No audit log API signals — enterprise customers need to export audit logs to their own SIEM." });

  // A status/uptime HOST (status.x.com, githubstatus.com, vercel-status.com) or a status-like
  // LAST path segment (/status, /en/status, /system-status, /support/systemstatus/, with an
  // optional query) — never 'status' mid-path, as in x.com/<user>/status/<id> post links,
  // and never the status of a customer's own record (/orders/status, /application/status).
  const hasStatusPage = /href=["']https?:\/\/[^"'\/?#]*(?:status|uptime)[^"'\/?#]*(?:[\/?#][^"']*)?["']|href=["'](?:https?:\/\/[^"'\/]+)?(?:\/[^"'\/?#]*)*\/(?<!\/(?:orders?|account|track(?:ing)?|shipments?|deliver(?:y|ies)|payments?|applications?|claims?)\/)(?:(?:system|service)-?)?(?:status|uptime)\/?(?:[?#][^"']*)?["']|system status|service status/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "public_status_page", label: "Public service status page", status: hasStatusPage ? "PASS" : "WARN", detail: hasStatusPage ? "A public status or uptime page is linked." : "No link to a public status page was found on the scanned page. If you already publish one, link it from the footer; otherwise publish current component health and incident history so customers can self-diagnose outages." });

  const hasIncidentSubscriptions = /subscribe.{0,40}(?:incident|status|outage)|(?:incident|status) updates|notify me.{0,30}(?:incident|outage)/i.test(html);
  checks.push({ category: CATEGORIES.OBSERVABILITY, checkKey: "incident_subscriptions", label: "Customers can subscribe to incident updates", status: hasIncidentSubscriptions ? "PASS" : "WARN", detail: hasIncidentSubscriptions ? "Incident-update subscription evidence detected." : "No incident subscription mechanism was observed. Let customers opt into outage and recovery notifications instead of repeatedly checking a page." });

  return checks;
}

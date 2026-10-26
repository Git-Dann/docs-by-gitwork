/**
 * A whole Pulse scan in plain English: is it ready, what must be fixed first, and what Pulse
 * could not check. For founders, account managers and clients, who read a report to decide,
 * not to debug. Deterministic: the order is Pulse's own priority ranking (rankFindings), and
 * each finding's sentence is chosen from what the check is about, never written by AI.
 *
 * Code health has its own plain summary (code-health-summary.ts), so its checks are left out
 * here rather than said twice.
 */

import { rankFindings } from "@/server/pulse-checks/priority";

export interface PlainCheck {
  checkKey: string;
  label: string;
  category: string;
  status: string;
  confidence?: string | null;
  trustBucket?: string | null;
}

export interface PlainFinding {
  /** What could happen, in plain words. */
  text: string;
  /** The check it came from, for anyone who wants the detail. */
  label: string;
  urgent: boolean;
}

export interface PlainScanSummary {
  headline: string;
  tone: "good" | "watch" | "bad";
  findings: PlainFinding[];
  /** Things Pulse could not establish from what it scanned, so they are not claimed either way. */
  unchecked: number;
}

/** What a finding means, matched on the check's key. First match wins, most serious first. */
const MEANING: { test: RegExp; text: string }[] = [
  // Before the generic "logging" rule below: these log passwords or tokens, not a lack of logs.
  { test: /release_logging|credential_log|log_sensitive|logs?_password|password_log/, text: "Passwords or sign-in tokens are written to logs, where others could read them." },
  { test: /secret|api_?key|credential|private_key|exposed_env|env_file|token_leak/, text: "A secret key is somewhere others can read it. Anyone who finds it could use the service it unlocks, at your cost." },
  { test: /rls|row_level|unauthenticated_data|idor|broken_access/, text: "Some data can be read by people who should not be able to see it." },
  { test: /env_baseurl|staging|non_prod|debug_build|debuggable/, text: "The app is pointed at a test setup, not the live one: a release built now would behave differently from what was tested." },
  { test: /token_storage|password_retention|keychain|userdefaults|shared_?pref|secure_storage|insecure_storage/, text: "Sign-in details are stored where another app, a backup or a lost phone could expose them." },
  { test: /cleartext|http_redirect|https|ssl|tls|hsts|mixed_content/, text: "Some traffic is not encrypted, so on public Wi-Fi it could be read or changed." },
  { test: /payment|stripe|webhook_signature|checkout/, text: "Part of taking payments is not set up safely, which risks lost or forged payments." },
  { test: /privacy_policy|privacy_manifest|data_safety|app_privacy/, text: "The privacy information the law and the app stores require is missing or incomplete." },
  { test: /terms_of_service|terms/, text: "There are no terms of service linked, so the rules for using the product are not set out." },
  { test: /cookie|consent|tracking_before/, text: "Tracking starts before people agree to it, which UK and EU law does not allow." },
  { test: /software_updates|platform_up_to_date|cms_version|wordpress|plugin_version|end_of_life|eol/, text: "The site runs out-of-date software, and old versions have known holes that attackers look for." },
  { test: /dependency|vulnerab|outdated|cve/, text: "Some of the outside software it is built on has known security holes." },
  { test: /test_coverage|has_tests|tests?_present|no_tests/, text: "There are almost no automated tests, so a change can break something without anyone noticing until a customer does." },
  { test: /error_monitoring|sentry|observab|logging|uptime/, text: "Errors in the live product are not tracked, so problems go unnoticed until someone complains." },
  { test: /backup|disaster|restore/, text: "There is no sign of backups, so lost data might not come back." },
  { test: /csp|security_headers|x_frame|clickjack|permissions_policy|referrer/, text: "The site is missing standard browser protections that block common attacks." },
  { test: /rate_limit|brute|captcha|lockout/, text: "Nothing stops someone trying passwords or hammering the service over and over." },
  { test: /accessib|a11y|wcag|alt_text|contrast|aria|dynamic_type|semantics/, text: "Parts of it are hard or impossible to use for people with disabilities, and accessibility law applies." },
  { test: /lcp|cls|inp|performance|page_speed|bundle|image_size|cache/, text: "It is slower than it should be, which loses visitors and search ranking." },
  { test: /seo|meta_|sitemap|robots|canonical|open_graph/, text: "Search engines and social sites cannot read it well, so fewer people find it." },
  { test: /store_|listing|screenshot|age_rating/, text: "The store listing is missing something the store or customers expect." },
];

const CODE_HEALTH = /^code_health_|^dependency_osv_/;

export function findingMeaning(check: Pick<PlainCheck, "checkKey" | "label">): string {
  const key = check.checkKey.toLowerCase();
  const hit = MEANING.find((m) => m.test.test(key));
  // A check's label states the good state ("HTTPS is enforced"), so the fallback says it is not yet true.
  return hit ? hit.text : `Not yet in place: ${check.label.replace(/\.$/, "")}.`;
}

/** The release gate's decision, when the scan has one. It outranks the finding count. */
export type GateDecision = "READY" | "CONDITIONAL" | "BLOCKED" | "INCONCLUSIVE";

export function summariseScan(checks: PlainCheck[], maxFindings = 5, gate?: { decision: GateDecision; blocking: number } | null): PlainScanSummary {
  const ranked = rankFindings(checks.filter((c) => !CODE_HEALTH.test(c.checkKey)) as Parameters<typeof rankFindings>[0]);
  const serious = ranked.filter((r) => r.priority.tier === "P1" || r.priority.tier === "P2");
  const urgent = ranked.filter((r) => r.priority.tier === "P1").length;

  // One sentence per meaning: three TLS checks failing is one problem to a reader, not three.
  const findings: PlainFinding[] = [];
  const seen = new Set<string>();
  for (const r of serious) {
    const text = findingMeaning(r.check);
    if (seen.has(text)) continue;
    seen.add(text);
    findings.push({ text, label: r.check.label, urgent: r.priority.tier === "P1" });
    if (findings.length >= maxFindings) break;
  }

  // With a release gate, the headline is the gate's decision in plain words, so this box can
  // never say "close to ready" beside a banner that says "blocked" (an audit caught exactly
  // that). The finding count only fills the list.
  let headline: string;
  let tone: PlainScanSummary["tone"];
  if (gate) {
    const n = gate.blocking;
    const byDecision: Record<GateDecision, { headline: string; tone: PlainScanSummary["tone"] }> = {
      BLOCKED: { headline: `Not ready to launch: ${n > 0 ? `${n} ${n === 1 ? "thing blocks" : "things block"} release` : "something blocks release"}. Fix those first.`, tone: "bad" as const },
      INCONCLUSIVE: { headline: "Pulse could not check enough to call it either way. The list below is what it did find; the rest needs more access to confirm.", tone: "watch" as const },
      CONDITIONAL: { headline: `Can launch, with care: nothing blocks release, but ${serious.length || "some"} ${serious.length === 1 ? "thing is" : "things are"} worth fixing soon.`, tone: "watch" as const },
      READY: { headline: "Ready to launch: nothing blocks release in what Pulse could check.", tone: "good" as const },
    };
    ({ headline, tone } = byDecision[gate.decision]);
  } else {
    headline =
      urgent > 0
        ? `Not ready to launch yet: ${urgent} ${urgent === 1 ? "thing needs" : "things need"} fixing first.`
        : serious.length > 0
          ? `Close to ready: nothing blocks launch, but ${serious.length} ${serious.length === 1 ? "thing is" : "things are"} worth fixing soon.`
          : "Ready: Pulse found nothing serious in what it could check.";
    tone = urgent > 0 ? "bad" : serious.length > 0 ? "watch" : "good";
  }

  return {
    headline,
    tone,
    findings,
    unchecked: checks.filter((c) => c.status === "INCONCLUSIVE").length,
  };
}

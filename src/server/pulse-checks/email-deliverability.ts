import { CATEGORIES } from "./categories";
import { type DnsResolution, type ExtendedCheckContext, type PulseScanCheckInput, resolveDnsRecord, resolveAllDnsRecords, probeInconclusive, skip, platformIs } from "./_types";
import { analyzeHost, boundedDmarcCandidates, organizationalDomainCandidates } from "@/server/pulse-lite/registrable-domain";
import { type DmarcTags, parseDmarcTags } from "@/server/pulse-scan";

const CATEGORY = CATEGORIES.EMAIL;

const ALL_CHECKS: Array<[string, string]> = [
  ["dkim_record_present", "DKIM record configured"],
  ["bimi_record_present", "BIMI DNS record (brand in inbox)"],
  ["mta_sts_policy", "MTA-STS enforced mail transfer"],
  ["tls_rpt_record", "TLS-RPT reporting record"],
  ["spf_hardfail", "SPF uses -all (hardfail)"],
  ["dmarc_quarantine_reject", "DMARC policy: quarantine or reject"],
  ["email_unsubscribe_signal", "Unsubscribe / list management link"],
  ["transactional_subdomain", "Dedicated sending subdomain"],
  ["can_spam_address", "Physical address in email footer"],
  ["casl_double_optin", "Double opt-in / CASL signals"],
  ["plain_text_email", "Plain text email alternative"],
  ["bounce_handling_signal", "Bounce handling / list hygiene"],
  ["email_preview_configured", "Email preview text configured"],
  ["email_warm_up_signals", "Reputable ESP detected"],
  ["mailing_list_segmentation", "Email segmentation / tagging signals"],
  ["email_mx_present", "Domain accepts email through MX records"],
  ["spf_single_record", "Exactly one SPF policy is published"],
  ["dmarc_aggregate_reporting", "DMARC aggregate reports have a destination"],
  ["dmarc_full_coverage", "DMARC policy applies to 100% of messages"],
  ["tls_rpt_destination", "TLS-RPT reports have a destination"],
];

// ─── DMARC discovery (RFC 7489 §6.6.3) ───────────────────────────────────────
//
// Three checks in this module read a DMARC record — `dmarc_quarantine_reject`,
// `dmarc_aggregate_reporting`, `dmarc_full_coverage` — and all three used to make
// ONE `_dmarc.<hostname>` query and stop. That is the exact defect repaired for
// `dmarc_record` in pulse-scan.ts: §6.6.3 REQUIRES a receiver that finds no
// record at the DNS domain to retry at the organizational domain, so querying
// once told every subdomain of every DMARC-protected organisation that it had no
// impersonation protection, no report destination and no enforcement coverage.
// Verified live over DoH (2026-08-22):
//
//   _dmarc.www.gov.uk       → nothing                       ← the only query made
//   _dmarc.gov.uk           → p=reject;sp=none;np=reject
//   _dmarc.mozilla.org      → p=reject                      (no sp=)
//   _dmarc.hmrc.gov.uk      → p=reject;fo=1                 (departments run their own zones)
//   _dmarc.ycombinator.com  → p=none;sp=none
//
// ⚠️ Finding a parent record is NOT a pass. For a subdomain that EXISTS the
// governing policy is the parent's `sp=`; `p=` applies only when no `sp=` is
// published; and `np=` (RFC 9091) scopes to names that do NOT exist, so it is
// irrelevant to a host Pulse just fetched a page from. gov.uk publishes
// `p=reject; sp=none`, so www.gov.uk is NOT protected — reading `p=reject` and
// passing it would be a FALSE NEGATIVE on an email-spoofing check.
//
// ⚠️ This retry must NEVER be applied to the SPF checks in this file. RFC 7208
// §3.1 makes SPF explicitly non-inheriting, and news.ycombinator.com's missing
// SPF is a verified-correct finding an organizational-domain fallback would
// destroy.
//
// Parsing is delegated to `parseDmarcTags` from pulse-scan.ts rather than
// reimplemented: two DMARC parsers that disagree is worse than the original bug.

/** The DMARC record that actually governs mail claiming to be from the scanned host. */
export type ApplicableDmarc =
  /** Discovery could not be completed. Unknown — never rendered as absence. */
  | { kind: "unavailable"; reason: string }
  /** Discovery completed across every name that could hold a record; there is none. */
  | { kind: "absent"; searched: string[] }
  /** A record at `_dmarc.<host>` itself. Its own `p=` governs this host. */
  | { kind: "own"; tags: DmarcTags; queried: string }
  /** No own record; this organizational domain's record governs, via `sp=` when present. */
  | { kind: "inherited"; tags: DmarcTags; from: string; queried: string };

/** DoH returns TXT RDATA quoted, and a long record arrives as several quoted chunks. */
function txtValues(records: string[]): string[] {
  return records.map((record) => record.replace(/"/g, "").trim());
}

export function resolveApplicableDmarc(input: {
  hostname: string;
  atHost: DnsResolution;
  /** Organizational-domain candidates actually queried, most specific first. */
  parents: Array<{ domain: string; lookup: DnsResolution }>;
  /**
   * Set only when a parent COULD exist but could not be identified. An apex — or
   * any name with no organizational domain above it — has nothing to retry, so
   * its absence is a complete answer and this stays `null`.
   */
  unresolvedReason: string | null;
}): ApplicableDmarc {
  const queried = `_dmarc.${input.hostname}`;

  if (!input.atHost.ok) {
    return { kind: "unavailable", reason: `The DNS lookup for ${queried} did not complete (${input.atHost.reason}).` };
  }

  const own = parseDmarcTags(txtValues(input.atHost.records));
  if (own) return { kind: "own", tags: own, queried };

  for (const parent of input.parents) {
    if (!parent.lookup.ok) {
      return {
        kind: "unavailable",
        reason: `No record at ${queried}, and the RFC 7489 §6.6.3 organizational-domain retry at _dmarc.${parent.domain} did not complete (${parent.lookup.reason}), so the inherited policy is unknown.`,
      };
    }
    const inherited = parseDmarcTags(txtValues(parent.lookup.records));
    if (inherited) return { kind: "inherited", tags: inherited, from: parent.domain, queried };
  }

  if (input.unresolvedReason) {
    return {
      kind: "unavailable",
      reason: `No record at ${queried}, and Pulse could not complete the RFC 7489 §6.6.3 organizational-domain retry: ${input.unresolvedReason} Reported as unknown rather than missing, because the record may sit on a parent name Pulse could not identify.`,
    };
  }

  return { kind: "absent", searched: [queried, ...input.parents.map((parent) => `_dmarc.${parent.domain}`)] };
}

/**
 * The policy a receiver applies to mail from the scanned host itself.
 *
 * `null` when no applicable record was established. For an inherited record this
 * is `sp=` when published, because that is the tag that governs subdomains.
 */
export function governingDmarcPolicy(applicable: ApplicableDmarc): string | null {
  if (applicable.kind === "own") return applicable.tags.p;
  if (applicable.kind === "inherited") return applicable.tags.sp ?? applicable.tags.p;
  return null;
}

const DMARC_LABELS = {
  policy: "DMARC policy: quarantine or reject",
  reporting: "DMARC aggregate reports have a destination",
  coverage: "DMARC policy applies to 100% of messages",
} as const;

/** Build the three DMARC checks from one resolved discovery result. */
export function dmarcPolicyChecks(hostname: string, applicable: ApplicableDmarc): {
  policy: PulseScanCheckInput;
  reporting: PulseScanCheckInput;
  coverage: PulseScanCheckInput;
} {
  if (applicable.kind === "unavailable") {
    return {
      policy: probeInconclusive(CATEGORY, "dmarc_quarantine_reject", DMARC_LABELS.policy, applicable.reason),
      reporting: probeInconclusive(CATEGORY, "dmarc_aggregate_reporting", DMARC_LABELS.reporting, applicable.reason),
      coverage: probeInconclusive(CATEGORY, "dmarc_full_coverage", DMARC_LABELS.coverage, applicable.reason),
    };
  }

  if (applicable.kind === "absent") {
    const searched = applicable.searched.join(", ");
    const nothing = `No DMARC record was found. Pulse queried ${searched} — the full RFC 7489 §6.6.3 discovery path.`;
    const evidence = `No v=DMARC1 record at ${searched}`;
    return {
      policy: { category: CATEGORY, checkKey: "dmarc_quarantine_reject", label: DMARC_LABELS.policy, status: "WARN", detail: `${nothing} Configure DMARC to protect your domain from email impersonation.`, evidence },
      reporting: { category: CATEGORY, checkKey: "dmarc_aggregate_reporting", label: DMARC_LABELS.reporting, status: "WARN", detail: `${nothing} With no record there is no aggregate-report destination (rua=mailto:…), so enforcement changes cannot be validated safely.`, evidence },
      coverage: { category: CATEGORY, checkKey: "dmarc_full_coverage", label: DMARC_LABELS.coverage, status: "WARN", detail: `${nothing} Enforcement coverage therefore cannot be verified.`, evidence },
    };
  }

  const { tags } = applicable;
  const inherited = applicable.kind === "inherited";
  const from = inherited ? applicable.from : null;
  // Names the record actually read, so an inherited verdict can never be mistaken
  // for something published on the scanned host.
  const source = inherited
    ? `No record exists at ${applicable.queried}, so RFC 7489 §6.6.3 discovery falls back to the organizational domain _dmarc.${from}`
    : `A DMARC record is published at ${applicable.queried}`;
  const evidence = inherited ? `Inherited from _dmarc.${from}: ${tags.raw}` : tags.raw;

  const policy = governingDmarcPolicy(applicable);
  const enforcing = policy === "quarantine" || policy === "reject";
  const governingTag = inherited && applicable.tags.sp ? "sp" : "p";
  const governingLabel = policy ? `${governingTag}=${policy}` : `${governingTag}= (unspecified)`;

  const policyDetail = enforcing
    ? inherited
      ? `${source}, which publishes ${governingLabel} — the tag that governs subdomains — so mail claiming to be from ${hostname} is covered by an enforcing policy.`
      : `${source} with ${governingLabel} — domain impersonation is actively blocked.`
    : policy === "none"
      ? inherited
        ? `${source}, which publishes ${governingLabel}. That is the tag that governs subdomains and it asks receivers to take no action, so mail impersonating ${hostname} is not quarantined or rejected. Publish a record at ${applicable.queried}, or tighten sp= on ${from}.`
        : `${source} but it is ${governingLabel} (monitor only) — upgrade to p=quarantine or p=reject to actively protect your domain from spoofing.`
      : inherited
        ? `${source}, but that record declares no policy tag Pulse can act on (${governingLabel}), so receivers are given no instruction for mail impersonating ${hostname}. Publish a record at ${applicable.queried}.`
        : `${source} but it declares no p= policy tag, so receivers are given no instruction for unauthenticated mail. Add p=quarantine or p=reject.`;

  const hasReporting = /(?:^|;)\s*rua\s*=\s*mailto:[^;\s]+/i.test(tags.raw);
  const pctMatch = tags.raw.match(/(?:^|;)\s*pct\s*=\s*(\d{1,3})\b/i);
  // RFC 7489 §6.3: pct defaults to 100 when the tag is absent.
  const pct = pctMatch ? Number(pctMatch[1]) : 100;
  const applicableRecord = inherited ? `The applicable DMARC record (inherited from _dmarc.${from})` : "The DMARC record";

  return {
    policy: {
      category: CATEGORY,
      checkKey: "dmarc_quarantine_reject",
      label: DMARC_LABELS.policy,
      status: enforcing ? "PASS" : "WARN",
      detail: policyDetail,
      evidence,
    },
    reporting: {
      category: CATEGORY,
      checkKey: "dmarc_aggregate_reporting",
      label: DMARC_LABELS.reporting,
      status: hasReporting ? "PASS" : "WARN",
      detail: hasReporting
        ? `${applicableRecord} publishes a rua=mailto: destination, enabling visibility into legitimate and spoofed senders.`
        : `${applicableRecord} has no aggregate-report destination (rua=mailto:…). Without reports, enforcement changes are difficult to validate safely.`,
      evidence,
    },
    coverage: {
      category: CATEGORY,
      checkKey: "dmarc_full_coverage",
      label: DMARC_LABELS.coverage,
      status: pct === 100 ? "PASS" : "WARN",
      detail: pct === 100
        ? `${applicableRecord} applies to 100% of evaluated messages.`
        : `${applicableRecord} applies to ${pct}% of messages. Increase pct to 100 after reports confirm all legitimate senders align.`,
      evidence,
    },
  };
}

export async function runEmailDeliverabilityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { hostname } = ctx;
  const html = ctx.pageResult.html;

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP", "CLI_TOOL")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — email deliverability checks are not relevant for this platform type.");
  }

  const checks: PulseScanCheckInput[] = [];

  // ── DNS-derived checks ──────────────────────────────────────────────────────
  // Every verdict below is drawn from the ABSENCE of a record, so every one of
  // them is only sound if the lookup actually completed. They previously read a
  // failed lookup as an empty answer, which turned a resolver blip into "no SPF
  // record", "no DKIM selectors", "no MX" — a client's whole email setup
  // reported as broken by an outage on our side. Each now says so instead.
  //
  // DMARC additionally needs its organizational-domain candidates (RFC 7489
  // §6.6.3) — see the section note above `resolveApplicableDmarc`. They are
  // queried in the same wave, so discovery costs no extra round trip.
  const dmarcParentNames = boundedDmarcCandidates(organizationalDomainCandidates(hostname));
  const [[dkim, bimi, mtaSts, tlsRptLookup, spfLookup, dmarcLookup, mxLookup], dmarcParentLookups] = await Promise.all([
    Promise.all([
      resolveAllDnsRecords([
        [`default._domainkey.${hostname}`, "TXT"],
        [`google._domainkey.${hostname}`, "TXT"],
        [`k1._domainkey.${hostname}`, "TXT"],
        [`s1._domainkey.${hostname}`, "TXT"],
      ]),
      resolveDnsRecord(`default._bimi.${hostname}`, "TXT"),
      resolveDnsRecord(`_mta-sts.${hostname}`, "TXT"),
      resolveDnsRecord(`_smtp._tls.${hostname}`, "TXT"),
      resolveDnsRecord(hostname, "TXT"),
      resolveDnsRecord(`_dmarc.${hostname}`, "TXT"),
      resolveDnsRecord(hostname, "MX"),
    ]),
    Promise.all(dmarcParentNames.map((name) => resolveDnsRecord(`_dmarc.${name}`, "TXT"))),
  ]);
  const dnsFailed = (reason: string) => `The DNS lookup did not complete (${reason}).`;

  // Resolved once, read by all three DMARC checks so they can never contradict
  // one another about which record governs this host.
  const hostAnalysis = analyzeHost(hostname);
  const dmarcApplicable = resolveApplicableDmarc({
    hostname,
    atHost: dmarcLookup,
    parents: dmarcParentNames.map((domain, index) => ({ domain, lookup: dmarcParentLookups[index] })),
    // A parent can only exist if there are labels above a registrable domain. An
    // apex has none, and neither does a name of two labels or fewer, whose only
    // ancestor is a TLD — for both, absence at the host is a complete answer.
    // Only a longer name whose registrable domain we could not establish leaves
    // the discovery algorithm genuinely unfinished.
    unresolvedReason:
      dmarcParentNames.length === 0 && !hostAnalysis.isIpLiteral && hostAnalysis.hostname.split(".").length > 2
        ? hostAnalysis.reason
        : null,
  });
  const dmarcChecks = dmarcPolicyChecks(hostname, dmarcApplicable);

  // DKIM
  if (!dkim.ok) {
    checks.push(probeInconclusive(CATEGORY, "dkim_record_present", "DKIM record configured", dnsFailed(dkim.reason)));
  } else {
    const hasDkim = dkim.records.some((r) => r.includes("v=DKIM1"));
    checks.push({ category: CATEGORY, checkKey: "dkim_record_present", label: "DKIM record configured", status: hasDkim ? "PASS" : "WARN", detail: hasDkim ? "DKIM TXT record detected — outbound email is cryptographically signed." : "No common DKIM selectors found — DKIM signing is required for inbox placement and DMARC enforcement. Configure DKIM with your ESP." });
  }

  // BIMI
  if (!bimi.ok) {
    checks.push(probeInconclusive(CATEGORY, "bimi_record_present", "BIMI DNS record (brand in inbox)", dnsFailed(bimi.reason)));
  } else {
    const hasBimi = bimi.records.some((r) => r.includes("v=BIMI1"));
    checks.push({ category: CATEGORY, checkKey: "bimi_record_present", label: "BIMI DNS record (brand in inbox)", status: hasBimi ? "PASS" : "WARN", detail: hasBimi ? "BIMI record detected — your brand logo will appear in supporting email clients." : "No BIMI record — Brand Indicators for Message Identification (BIMI) displays your logo in Gmail, Yahoo, and Apple Mail inboxes, increasing open rates." });
  }

  // MTA-STS
  if (!mtaSts.ok) {
    checks.push(probeInconclusive(CATEGORY, "mta_sts_policy", "MTA-STS enforced mail transfer", dnsFailed(mtaSts.reason)));
  } else {
    const hasMtaSts = mtaSts.records.some((r) => r.includes("v=STSv1"));
    checks.push({ category: CATEGORY, checkKey: "mta_sts_policy", label: "MTA-STS enforced mail transfer", status: hasMtaSts ? "PASS" : "WARN", detail: hasMtaSts ? "MTA-STS policy detected — inbound email is enforced to use TLS." : "No MTA-STS policy — MTA-STS prevents SMTP downgrade attacks and ensures inbound email is delivered over encrypted connections." });
  }

  // TLS-RPT
  const tlsRptRecords = tlsRptLookup.ok ? tlsRptLookup.records : [];
  if (!tlsRptLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "tls_rpt_record", "TLS-RPT reporting record", dnsFailed(tlsRptLookup.reason)));
  } else {
    const hasTlsRpt = tlsRptRecords.some((r) => r.includes("v=TLSRPTv1"));
    checks.push({ category: CATEGORY, checkKey: "tls_rpt_record", label: "TLS-RPT reporting record", status: hasTlsRpt ? "PASS" : "WARN", detail: hasTlsRpt ? "TLS-RPT record detected — TLS connection failures are reported." : "No TLS-RPT record — TLS reporting (RFC 8460) sends reports when email delivery fails due to TLS negotiation issues." });
  }

  // SPF hardfail
  const spfRecords = spfLookup.ok ? spfLookup.records : [];
  if (!spfLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "spf_hardfail", "SPF uses -all (hardfail)", dnsFailed(spfLookup.reason)));
  } else {
    const spf = spfRecords.find((r) => r.includes("v=spf1"));
    const hasSpfHardfail = spf ? spf.includes("-all") : false;
    const hasSpfSoftfail = spf ? spf.includes("~all") : false;
    checks.push({ category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: hasSpfHardfail ? "PASS" : spf ? "WARN" : "WARN", detail: hasSpfHardfail ? "SPF -all (hardfail) configured — unauthorised senders are rejected." : hasSpfSoftfail ? "SPF uses ~all (softfail) — upgrade to -all (hardfail) to instruct receivers to reject rather than mark messages from unauthorised senders." : "No SPF record found — configure SPF to declare authorised sending servers." });
  }

  // DMARC quarantine/reject — the governing policy, from the record RFC 7489
  // §6.6.3 discovery actually resolved. Reading only `_dmarc.<host>` reported
  // every subdomain of a DMARC-protected organisation as unprotected; matching
  // the substring `p=quarantine` also matched `sp=quarantine`, passing a host
  // whose own policy was `p=none`.
  checks.push(dmarcChecks.policy);

  if (!mxLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "email_mx_present", "Domain accepts email through MX records", dnsFailed(mxLookup.reason)));
  } else {
    const mxRecords = mxLookup.records;
    checks.push({ category: CATEGORY, checkKey: "email_mx_present", label: "Domain accepts email through MX records", status: mxRecords.length > 0 ? "PASS" : "WARN", detail: mxRecords.length > 0 ? `${mxRecords.length} MX record${mxRecords.length === 1 ? "" : "s"} detected for the domain.` : "No MX record was found. If this domain sends customer email, configure a monitored receiving route for replies, abuse reports, and delivery failures." });
  }

  // The four checks below are DERIVED from the lookups above. This is where the
  // leak was worst: SPF and DMARC already reported their own lookup failure, but
  // left the record arrays empty, so these four went on to conclude "No SPF
  // policy was found" from a lookup that never happened.
  // DNS-over-HTTPS commonly returns TXT RDATA wrapped in quotes. Match the
  // version token itself instead of assuming it is the first raw character.
  if (!spfLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "spf_single_record", "Exactly one SPF policy is published", dnsFailed(spfLookup.reason)));
  } else {
    const publishedSpf = spfRecords.filter((record) => /\bv=spf1\b/i.test(record));
    checks.push({ category: CATEGORY, checkKey: "spf_single_record", label: "Exactly one SPF policy is published", status: publishedSpf.length === 1 ? "PASS" : "WARN", detail: publishedSpf.length === 1 ? "Exactly one SPF policy is published, so receivers have an unambiguous sender-authorisation rule." : publishedSpf.length > 1 ? `${publishedSpf.length} SPF policies are published. Multiple SPF records cause a permanent evaluation error; merge them into one policy.` : "No SPF policy was found." });
  }

  // Both read the SAME applicable record as the policy check above. They used to
  // re-read `_dmarc.<host>` on their own, so a subdomain covered by its
  // organizational domain's record was told it had no report destination and no
  // enforcement coverage — while the record naming both sat one label up.
  checks.push(dmarcChecks.reporting);
  checks.push(dmarcChecks.coverage);

  if (!tlsRptLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "tls_rpt_destination", "TLS-RPT reports have a destination", dnsFailed(tlsRptLookup.reason)));
  } else {
    const tlsRpt = tlsRptRecords.find((record) => /v=TLSRPTv1/i.test(record));
    const hasTlsDestination = Boolean(tlsRpt && /(?:^|;)\s*rua=mailto:[^;\s]+/i.test(tlsRpt));
    checks.push({ category: CATEGORY, checkKey: "tls_rpt_destination", label: "TLS-RPT reports have a destination", status: hasTlsDestination ? "PASS" : "WARN", detail: hasTlsDestination ? "TLS-RPT publishes a mailto reporting destination." : "TLS-RPT has no valid mailto reporting destination. A version tag alone cannot deliver reports about failed or downgraded TLS sessions." });
  }

  // Unsubscribe signal
  const hasUnsubscribe = /unsubscribe|list.unsubscribe|opt.out.*email|email.*preferences/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "email_unsubscribe_signal", label: "Unsubscribe / list management link", status: hasUnsubscribe ? "PASS" : "WARN", detail: hasUnsubscribe ? "Unsubscribe / email preference signals detected on page." : "No unsubscribe link signals detected — CAN-SPAM, GDPR, and CASL all require easy unsubscribe; Google/Yahoo now enforce List-Unsubscribe headers." });

  // Transactional sending subdomain
  const sendingSubdomains = await resolveAllDnsRecords([
    [`mail.${hostname}`, "MX"],
    [`send.${hostname}`, "MX"],
    [`em.${hostname}`, "MX"],
  ]);
  if (!sendingSubdomains.ok) {
    checks.push(probeInconclusive(CATEGORY, "transactional_subdomain", "Dedicated sending subdomain", dnsFailed(sendingSubdomains.reason)));
  } else {
    const hasTransactionalSubdomain = sendingSubdomains.records.length > 0;
    checks.push({ category: CATEGORY, checkKey: "transactional_subdomain", label: "Dedicated sending subdomain", status: hasTransactionalSubdomain ? "PASS" : "WARN", detail: hasTransactionalSubdomain ? "Dedicated email sending subdomain detected (mail.*, send.*, em.*)." : "No dedicated sending subdomain detected — use a subdomain (mail.yourdomain.com) for transactional email to protect your root domain's reputation." });
  }

  // CAN-SPAM address
  const hasPhysicalAddress = /\d+\s+[a-z]+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|way|court|ct)\b/i.test(html) || /p\.?o\.?\s*box\s+\d+/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "can_spam_address", label: "Physical address in email footer", status: hasPhysicalAddress ? "PASS" : "WARN", detail: hasPhysicalAddress ? "Physical mailing address detected on page." : "No physical address detected — CAN-SPAM requires a valid physical postal address in every commercial email." });

  // CASL double opt-in
  const hasDoubleOptin = /double.*opt.in|confirm.*subscription|confirm.*email|verify.*subscription|casl/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "casl_double_optin", label: "Double opt-in / CASL signals", status: hasDoubleOptin ? "PASS" : "WARN", detail: hasDoubleOptin ? "Double opt-in / CASL signals detected." : "No double opt-in signals detected — Canada's CASL requires express consent for commercial emails; double opt-in is best practice globally." });

  // Plain text email
  const hasPlainTextEmail = /plain.*text.*email|text.*only.*email|email.*client.*support/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "plain_text_email", label: "Plain text email alternative", status: hasPlainTextEmail ? "PASS" : "WARN", detail: hasPlainTextEmail ? "Plain text email support signals detected." : "No plain text email signals — always send a plain text alternative with HTML emails; some email clients and spam filters prefer it." });

  // Bounce handling
  const hasBounceHandling = /bounce.*handling|list.*hygiene|clean.*list|invalid.*email|email.*validation|hard.*bounce/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "bounce_handling_signal", label: "Bounce handling / list hygiene", status: hasBounceHandling ? "PASS" : "WARN", detail: hasBounceHandling ? "Bounce handling / list hygiene signals detected." : "No bounce handling signals — high bounce rates damage sender reputation. Use an ESP with automated bounce handling and list hygiene." });

  // Email preview text
  const hasPreviewText = /preview.*text|preheader|email.*preview|preview.*message/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "email_preview_configured", label: "Email preview text configured", status: hasPreviewText ? "PASS" : "WARN", detail: hasPreviewText ? "Email preview / preheader text configuration signals detected." : "No email preview text signals — preheader text appears in inbox alongside the subject line and significantly affects open rates." });

  // ESP detection
  const hasReputableEsp = /sendgrid|mailchimp|klaviyo|mailgun|postmark|ses\b|amazon ses|sparkpost|brevo|sendinblue|resend\.com|loops\.so/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "email_warm_up_signals", label: "Reputable ESP detected", status: hasReputableEsp ? "PASS" : "WARN", detail: hasReputableEsp ? "Reputable Email Service Provider (ESP) detected — sending through a reputable ESP helps inbox placement." : "No reputable ESP detected — use a dedicated ESP (SendGrid, Postmark, Resend) rather than direct SMTP for reliable deliverability." });

  // Segmentation
  const hasSegmentation = /segment.*email|email.*segment|subscriber.*tag|tag.*subscriber|list.*segment|audience.*segment/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "mailing_list_segmentation", label: "Email segmentation / tagging signals", status: hasSegmentation ? "PASS" : "WARN", detail: hasSegmentation ? "Email segmentation / tagging signals detected." : "No email segmentation signals — segmenting email lists by behaviour, plan tier, or persona dramatically improves open rates and reduces unsubscribes." });

  return checks;
}

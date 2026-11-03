import { CATEGORIES } from "./categories";
import { type DnsResolution, type ExtendedCheckContext, type PulseScanCheckInput, resolveDnsRecord, resolveAllDnsRecords, probeInconclusive, skip, platformIs } from "./_types";
import { analyzeHost, boundedDmarcCandidates, organizationalDomainCandidates } from "@/server/pulse-lite/registrable-domain";
import { type DmarcTags, parseDmarcTags } from "@/server/pulse-scan";
import { dkimVerdict } from "./dkim-record";

const CATEGORY = CATEGORIES.EMAIL;

const ALL_CHECKS: Array<[string, string]> = [
  ["dkim_record_present", "DKIM record configured"],
  ["bimi_record_present", "BIMI DNS record (brand in inbox)"],
  ["mta_sts_policy", "MTA-STS enforced mail transfer"],
  ["tls_rpt_record", "TLS-RPT reporting record"],
  ["spf_hardfail", "SPF uses -all (hardfail)"],
  ["dmarc_quarantine_reject", "DMARC policy: quarantine or reject"],
  ["transactional_subdomain", "Dedicated sending subdomain"],
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

/**
 * Parent names RFC 7489 §6.6.3 discovery retries for `hostname`, most specific first,
 * bounded. The organizational domain is defined by the Public Suffix List, so a host
 * under a curated platform namespace that is NOT on the PSL (www.squarespace.com)
 * falls back to that namespace (squarespace.com, p=reject). That knowledge lives in
 * one place — `NAMESPACES_NOT_ON_PSL` in registrable-domain.ts — and is reached
 * through `organizationalDomainCandidates`.
 */
export function dmarcDiscoveryCandidates(hostname: string): string[] {
  return boundedDmarcCandidates(organizationalDomainCandidates(hostname));
}

/** Names a sending subdomain commonly takes, queried for MX (an ESP's return-path / bounce domain carries one). */
export const SENDING_SUBDOMAIN_LABELS = ["mail", "send", "em", "mg", "bounce", "bounces", "email", "mail2", "mailer"] as const;
/** Names an ESP commonly asks you to CNAME to it (return-path / link branding). */
export const SENDING_CNAME_LABELS = ["em", "bounce", "bounces", "pm-bounces", "email", "mg"] as const;
/** CNAME targets that belong to an email service provider. */
const ESP_CNAME_TARGET = /(?:sendgrid\.net|mailgun\.org|mtasv\.net|amazonses\.com|sparkpostmail\.com|mandrillapp\.com|mcsv\.net|rsgsv\.net|sendinblue\.com|brevo\.com|mailjet\.com|resend\.(?:com|dev)|postmarkapp\.com|customer\.io|mailchimp\.com|klaviyomail\.com|hubspotemail\.net)\.?$/i;

export function transactionalSubdomainCheck(
  hostname: string,
  probes: Array<{ name: string; kind: "MX" | "CNAME"; lookup: DnsResolution }>,
): PulseScanCheckInput {
  const base = { category: CATEGORY, checkKey: "transactional_subdomain", label: "Dedicated sending subdomain" } as const;
  const found = probes.find((probe) => probe.lookup.ok && probe.lookup.records.length > 0
    && (probe.kind === "MX" || probe.lookup.records.some((record) => ESP_CNAME_TARGET.test(record.trim()))));
  if (found && found.lookup.ok) {
    return { ...base, status: "PASS", detail: `Dedicated sending subdomain detected: ${found.name} (${found.kind} ${found.lookup.records[0]}).`, evidence: `${found.name} ${found.kind} ${found.lookup.records.join(", ")}` };
  }
  const failed = probes.filter((probe) => !probe.lookup.ok);
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    confidenceReason: "A sending subdomain can have any name; only common ones were queried.",
    detail: `None of the common sending-subdomain names (${probes.map((probe) => probe.name.split(".")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}) under ${hostname} has an MX record or an email-provider CNAME${failed.length ? `, and ${failed.length} of those lookups did not complete` : ""}. A sending subdomain can be named anything (SendGrid's are em plus digits), so this does not show there is none. If you send transactional email from the root domain, moving it to a subdomain keeps its reputation separate.`,
  };
}

/** The enforcing DMARC policy (with pct 100) that governs mail from the host, or null. */
function enforcingDmarc(applicable: ApplicableDmarc): string | null {
  const policy = governingDmarcPolicy(applicable);
  if (policy !== "quarantine" && policy !== "reject") return null;
  if (applicable.kind !== "own" && applicable.kind !== "inherited") return null;
  const pct = applicable.tags.raw.match(/(?:^|;)\s*pct\s*=\s*(\d{1,3})\b/i);
  if (pct && parseInt(pct[1], 10) < 100) return null;
  return policy;
}

export async function runEmailDeliverabilityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { hostname } = ctx;

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
  const dmarcParentNames = dmarcDiscoveryCandidates(hostname);
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
    // A revoked key (empty p=) is not a key, and four selectors are not all of them (dkim-record.ts).
    checks.push(dkimVerdict({ category: CATEGORY, checkKey: "dkim_record_present", label: "DKIM record configured" }, dkim, spfLookup));
  }

  // BIMI
  if (!bimi.ok) {
    checks.push(probeInconclusive(CATEGORY, "bimi_record_present", "BIMI DNS record (brand in inbox)", dnsFailed(bimi.reason)));
  } else {
    const hasBimi = bimi.records.some((r) => r.includes("v=BIMI1"));
    checks.push({ category: CATEGORY, checkKey: "bimi_record_present", label: "BIMI DNS record (brand in inbox)", status: hasBimi ? "PASS" : "NOT_APPLICABLE", detail: hasBimi ? "BIMI record detected — your brand logo will appear in supporting email clients." : "Optional — not having it is not a defect. No BIMI record at default._bimi; BIMI shows your logo beside your mail in Gmail, Yahoo and Apple Mail, and needs DMARC at quarantine or reject (and, for Gmail, a paid mark certificate) first." });
  }

  // MTA-STS
  if (!mtaSts.ok) {
    checks.push(probeInconclusive(CATEGORY, "mta_sts_policy", "MTA-STS enforced mail transfer", dnsFailed(mtaSts.reason)));
  } else {
    const hasMtaSts = mtaSts.records.some((r) => r.includes("v=STSv1"));
    // RFC 7505: a lone `0 .` MX declares the domain accepts no email, so there is
    // no inbound transfer for MTA-STS to protect.
    const declaresNullMx = mxLookup.ok && mxLookup.records.length > 0 && mxLookup.records.every((r) => /^\s*0\s+\.\s*$/.test(r));
    checks.push(!hasMtaSts && declaresNullMx
      ? { category: CATEGORY, checkKey: "mta_sts_policy", label: "MTA-STS enforced mail transfer", status: "NOT_APPLICABLE", detail: `${hostname} publishes a null MX record (RFC 7505), declaring that it accepts no email, so there is no inbound mail transfer for MTA-STS to protect.` }
      : { category: CATEGORY, checkKey: "mta_sts_policy", label: "MTA-STS enforced mail transfer", status: hasMtaSts ? "PASS" : "WARN", detail: hasMtaSts ? `MTA-STS TXT record (v=STSv1) detected — supporting senders fetch the policy from mta-sts.${hostname} before delivering inbound email over TLS.` : "No MTA-STS policy — MTA-STS prevents SMTP downgrade attacks and ensures inbound email is delivered over encrypted connections." });
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
    // RFC 7208 §3.3: a long record arrives as several quoted chunks concatenated
    // WITHOUT a separator. The all-mechanism is matched as a whole term, so
    // `include:spf-all.example` is not read as `-all`.
    const spf = spfRecords
      .map((r) => r.replace(/"\s*"/g, "").replace(/"/g, "").trim())
      .find((r) => /^v=spf1(?:\s|$)/i.test(r));
    const allTerm = spf?.match(/(?:^|\s)([-~?+]?all)(?=\s|$)/i)?.[1]?.toLowerCase() ?? null;
    const hasSpfHardfail = allTerm === "-all";
    const hasSpfSoftfail = allTerm === "~all";
    // RFC 7208 §6.1: with no `all` mechanism, `redirect=` hands the final verdict
    // to another record that this probe does not evaluate.
    const spfRedirect = spf && !allTerm ? spf.match(/(?:^|\s)redirect=(\S+)/i)?.[1] ?? null : null;
    // ~all under an ENFORCING DMARC policy is the recommended setup (RFC 7489 §10.1): DMARC
    // already rejects unaligned mail, and -all can make a receiver drop a message at
    // SMTP before DKIM alignment — the thing that rescues forwarded mail — is checked.
    const dmarcEnforcement = enforcingDmarc(dmarcApplicable);
    checks.push(hasSpfSoftfail && dmarcEnforcement
      ? { category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: "PASS", detail: `SPF ends in ~all (softfail) and the DMARC policy governing ${hostname} is ${dmarcEnforcement} at 100%. That is the recommended pairing: DMARC rejects mail that fails authentication, and ~all avoids receivers discarding forwarded mail before DKIM is checked. -all adds nothing here.`, evidence: spf }
      : spfRedirect
      ? { category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: "INCONCLUSIVE", confidence: "LOW", detail: `The SPF record at ${hostname} delegates its policy with redirect=${spfRedirect}. Pulse did not evaluate that record, so whether unauthorised senders end in -all or ~all is unknown.`, evidence: spf }
      : { category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: hasSpfHardfail ? "PASS" : "WARN", detail: hasSpfHardfail ? "SPF -all (hardfail) configured — unauthorised senders are rejected." : hasSpfSoftfail ? "SPF uses ~all (softfail) — upgrade to -all (hardfail) to instruct receivers to reject rather than mark messages from unauthorised senders." : spf ? `The SPF record at ${hostname} ${allTerm ? `ends in ${allTerm}` : "has no all mechanism"} rather than -all, so receivers are not told to reject mail from unauthorised senders. End the record with -all.` : `No SPF record is published at ${hostname} — configure SPF to declare authorised sending servers. SPF is not inherited from parent domains (RFC 7208 §3.1).` });
  }

  // DMARC quarantine/reject — the governing policy, from the record RFC 7489
  // §6.6.3 discovery actually resolved. Reading only `_dmarc.<host>` reported
  // every subdomain of a DMARC-protected organisation as unprotected; matching
  // the substring `p=quarantine` also matched `sp=quarantine`, passing a host
  // whose own policy was `p=none`.
  checks.push(dmarcChecks.policy);


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
    checks.push({ category: CATEGORY, checkKey: "spf_single_record", label: "Exactly one SPF policy is published", status: publishedSpf.length === 1 ? "PASS" : "WARN", detail: publishedSpf.length === 1 ? "Exactly one SPF policy is published, so receivers have an unambiguous sender-authorisation rule." : publishedSpf.length > 1 ? `${publishedSpf.length} SPF policies are published. Multiple SPF records cause a permanent evaluation error; merge them into one policy.` : `No SPF policy is published at ${hostname}. SPF is not inherited from parent domains (RFC 7208 §3.1), so this name has none of its own.` });
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
    // RFC 8460 §3: `rua` may be mailto: OR https:. And with no TLS-RPT record at all there is
    // no destination to judge — `tls_rpt_record` already reports the absence, so a second WARN
    // here ("has no valid destination") contradicted it and double-counted one gap.
    const hasTlsDestination = Boolean(tlsRpt && /(?:^|;)\s*rua=(?:mailto:|https:)[^;\s]+/i.test(tlsRpt));
    checks.push(!tlsRpt
      ? { category: CATEGORY, checkKey: "tls_rpt_destination", label: "TLS-RPT reports have a destination", status: "NOT_APPLICABLE", detail: "No TLS-RPT record is published, so there is no reporting destination to check." }
      : { category: CATEGORY, checkKey: "tls_rpt_destination", label: "TLS-RPT reports have a destination", status: hasTlsDestination ? "PASS" : "WARN", detail: hasTlsDestination ? "TLS-RPT publishes a reporting destination." : "The TLS-RPT record has no valid rua= destination (mailto: or https:). A version tag alone cannot deliver reports about failed or downgraded TLS sessions." });
  }

  // Transactional sending subdomain. Sending subdomains can be named anything
  // (SendGrid's are em<digits>), so Pulse can only test common names: finding one
  // is evidence, NOT finding one is not evidence of absence — INCONCLUSIVE, not WARN.
  const [sendingMx, sendingCname] = await Promise.all([
    Promise.all(SENDING_SUBDOMAIN_LABELS.map((label) => resolveDnsRecord(`${label}.${hostname}`, "MX"))),
    Promise.all(SENDING_CNAME_LABELS.map((label) => resolveDnsRecord(`${label}.${hostname}`, "CNAME"))),
  ]);
  checks.push(transactionalSubdomainCheck(hostname, [
    ...SENDING_SUBDOMAIN_LABELS.map((label, i) => ({ name: `${label}.${hostname}`, kind: "MX" as const, lookup: sendingMx[i] })),
    ...SENDING_CNAME_LABELS.map((label, i) => ({ name: `${label}.${hostname}`, kind: "CNAME" as const, lookup: sendingCname[i] })),
  ]));

  // What a product's own emails contain (unsubscribe link, postal address, preview text,
  // a plain-text part) is read from its email templates in the repository
  // (email-templates.ts), not guessed from words on its website.

  return checks;
}

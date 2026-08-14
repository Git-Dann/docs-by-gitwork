import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, resolveDnsRecord, resolveAllDnsRecords, probeInconclusive, skip, platformIs } from "./_types";

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
  const [dkim, bimi, mtaSts, tlsRptLookup, spfLookup, dmarcLookup, mxLookup] = await Promise.all([
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
  ]);
  const dnsFailed = (reason: string) => `The DNS lookup did not complete (${reason}).`;

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

  // DMARC quarantine/reject
  const dmarcRecords = dmarcLookup.ok ? dmarcLookup.records : [];
  if (!dmarcLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "dmarc_quarantine_reject", "DMARC policy: quarantine or reject", dnsFailed(dmarcLookup.reason)));
  } else {
    const dmarcRecord = dmarcRecords.find((r) => r.includes("v=DMARC1"));
    const hasDmarcStrict = dmarcRecord ? (dmarcRecord.includes("p=quarantine") || dmarcRecord.includes("p=reject")) : false;
    const hasDmarcNone = dmarcRecord ? dmarcRecord.includes("p=none") : false;
    checks.push({ category: CATEGORY, checkKey: "dmarc_quarantine_reject", label: "DMARC policy: quarantine or reject", status: hasDmarcStrict ? "PASS" : dmarcRecord ? "WARN" : "WARN", detail: hasDmarcStrict ? "DMARC quarantine or reject policy configured — domain impersonation is actively blocked." : hasDmarcNone ? "DMARC is set to p=none (monitor only) — upgrade to p=quarantine or p=reject to actively protect your domain from spoofing." : "No DMARC record — configure DMARC to protect your domain from email impersonation." });
  }

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

  const dmarc = dmarcRecords.find((record) => /\bv=DMARC1\b/i.test(record));
  if (!dmarcLookup.ok) {
    checks.push(probeInconclusive(CATEGORY, "dmarc_aggregate_reporting", "DMARC aggregate reports have a destination", dnsFailed(dmarcLookup.reason)));
    checks.push(probeInconclusive(CATEGORY, "dmarc_full_coverage", "DMARC policy applies to 100% of messages", dnsFailed(dmarcLookup.reason)));
  } else {
    const hasDmarcReporting = Boolean(dmarc && /(?:^|;)\s*rua=mailto:[^;\s]+/i.test(dmarc));
    checks.push({ category: CATEGORY, checkKey: "dmarc_aggregate_reporting", label: "DMARC aggregate reports have a destination", status: hasDmarcReporting ? "PASS" : "WARN", detail: hasDmarcReporting ? "DMARC aggregate reports have a mailto destination, enabling visibility into legitimate and spoofed senders." : "No DMARC aggregate-report destination (rua=mailto:…) was found. Without reports, enforcement changes are difficult to validate safely." });

    const pctMatch = dmarc?.match(/(?:^|;)\s*pct=(\d{1,3})\b/i);
    const dmarcPct = pctMatch ? Number(pctMatch[1]) : dmarc ? 100 : 0;
    checks.push({ category: CATEGORY, checkKey: "dmarc_full_coverage", label: "DMARC policy applies to 100% of messages", status: dmarcPct === 100 ? "PASS" : "WARN", detail: dmarcPct === 100 ? "DMARC applies to 100% of evaluated messages." : dmarc ? `DMARC currently applies to ${dmarcPct}% of messages. Increase pct to 100 after reports confirm all legitimate senders align.` : "No DMARC policy was found, so enforcement coverage cannot be verified." });
  }

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

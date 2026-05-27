import { type ExtendedCheckContext, type PulseScanCheckInput, checkDnsRecord, skip, platformIs } from "./_types";

const CATEGORY = "Email Deliverability";

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
];

export async function runEmailDeliverabilityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { htmlLower, hostname } = ctx;
  const html = ctx.pageResult.html;

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "DESKTOP_APP", "CLI_TOOL")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — email deliverability checks are not relevant for this platform type.");
  }

  const checks: PulseScanCheckInput[] = [];

  // DKIM (check for common DKIM selector records)
  let hasDkim = false;
  try {
    const [dkimDefault, dkimGoogle, dkimMailgun, dkimSendgrid] = await Promise.all([
      checkDnsRecord(`default._domainkey.${hostname}`, "TXT"),
      checkDnsRecord(`google._domainkey.${hostname}`, "TXT"),
      checkDnsRecord(`k1._domainkey.${hostname}`, "TXT"),
      checkDnsRecord(`s1._domainkey.${hostname}`, "TXT"),
    ]);
    hasDkim = [...dkimDefault, ...dkimGoogle, ...dkimMailgun, ...dkimSendgrid].some((r) => r.includes("v=DKIM1"));
  } catch { /* ignore */ }
  checks.push({ category: CATEGORY, checkKey: "dkim_record_present", label: "DKIM record configured", status: hasDkim ? "PASS" : "WARN", detail: hasDkim ? "DKIM TXT record detected — outbound email is cryptographically signed." : "No common DKIM selectors found — DKIM signing is required for inbox placement and DMARC enforcement. Configure DKIM with your ESP." });

  // BIMI
  let hasBimi = false;
  try {
    const bimiRecords = await checkDnsRecord(`default._bimi.${hostname}`, "TXT");
    hasBimi = bimiRecords.some((r) => r.includes("v=BIMI1"));
  } catch { /* ignore */ }
  checks.push({ category: CATEGORY, checkKey: "bimi_record_present", label: "BIMI DNS record (brand in inbox)", status: hasBimi ? "PASS" : "WARN", detail: hasBimi ? "BIMI record detected — your brand logo will appear in supporting email clients." : "No BIMI record — Brand Indicators for Message Identification (BIMI) displays your logo in Gmail, Yahoo, and Apple Mail inboxes, increasing open rates." });

  // MTA-STS
  let hasMtaSts = false;
  try {
    const mtaStsRecords = await checkDnsRecord(`_mta-sts.${hostname}`, "TXT");
    hasMtaSts = mtaStsRecords.some((r) => r.includes("v=STSv1"));
  } catch { /* ignore */ }
  checks.push({ category: CATEGORY, checkKey: "mta_sts_policy", label: "MTA-STS enforced mail transfer", status: hasMtaSts ? "PASS" : "WARN", detail: hasMtaSts ? "MTA-STS policy detected — inbound email is enforced to use TLS." : "No MTA-STS policy — MTA-STS prevents SMTP downgrade attacks and ensures inbound email is delivered over encrypted connections." });

  // TLS-RPT
  let hasTlsRpt = false;
  try {
    const tlsRptRecords = await checkDnsRecord(`_smtp._tls.${hostname}`, "TXT");
    hasTlsRpt = tlsRptRecords.some((r) => r.includes("v=TLSRPTv1"));
  } catch { /* ignore */ }
  checks.push({ category: CATEGORY, checkKey: "tls_rpt_record", label: "TLS-RPT reporting record", status: hasTlsRpt ? "PASS" : "WARN", detail: hasTlsRpt ? "TLS-RPT record detected — TLS connection failures are reported." : "No TLS-RPT record — TLS reporting (RFC 8460) sends reports when email delivery fails due to TLS negotiation issues." });

  // SPF hardfail
  let hasSpfHardfail = false;
  try {
    const spfRecords = await checkDnsRecord(hostname, "TXT");
    const spf = spfRecords.find((r) => r.includes("v=spf1"));
    hasSpfHardfail = spf ? spf.includes("-all") : false;
    const hasSpfSoftfail = spf ? spf.includes("~all") : false;
    checks.push({ category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: hasSpfHardfail ? "PASS" : spf ? "WARN" : "WARN", detail: hasSpfHardfail ? "SPF -all (hardfail) configured — unauthorised senders are rejected." : hasSpfSoftfail ? "SPF uses ~all (softfail) — upgrade to -all (hardfail) to instruct receivers to reject rather than mark messages from unauthorised senders." : "No SPF record found — configure SPF to declare authorised sending servers." });
  } catch {
    checks.push({ category: CATEGORY, checkKey: "spf_hardfail", label: "SPF uses -all (hardfail)", status: "WARN", detail: "Could not verify SPF record — DNS lookup failed." });
  }

  // DMARC quarantine/reject
  let hasDmarcStrict = false;
  try {
    const dmarcRecords = await checkDnsRecord(`_dmarc.${hostname}`, "TXT");
    const dmarc = dmarcRecords.find((r) => r.includes("v=DMARC1"));
    hasDmarcStrict = dmarc ? (dmarc.includes("p=quarantine") || dmarc.includes("p=reject")) : false;
    const hasDmarcNone = dmarc ? dmarc.includes("p=none") : false;
    checks.push({ category: CATEGORY, checkKey: "dmarc_quarantine_reject", label: "DMARC policy: quarantine or reject", status: hasDmarcStrict ? "PASS" : dmarc ? "WARN" : "WARN", detail: hasDmarcStrict ? "DMARC quarantine or reject policy configured — domain impersonation is actively blocked." : hasDmarcNone ? "DMARC is set to p=none (monitor only) — upgrade to p=quarantine or p=reject to actively protect your domain from spoofing." : "No DMARC record — configure DMARC to protect your domain from email impersonation." });
  } catch {
    checks.push({ category: CATEGORY, checkKey: "dmarc_quarantine_reject", label: "DMARC policy: quarantine or reject", status: "WARN", detail: "Could not verify DMARC record — DNS lookup failed." });
  }

  // Unsubscribe signal
  const hasUnsubscribe = /unsubscribe|list.unsubscribe|opt.out.*email|email.*preferences/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "email_unsubscribe_signal", label: "Unsubscribe / list management link", status: hasUnsubscribe ? "PASS" : "WARN", detail: hasUnsubscribe ? "Unsubscribe / email preference signals detected on page." : "No unsubscribe link signals detected — CAN-SPAM, GDPR, and CASL all require easy unsubscribe; Google/Yahoo now enforce List-Unsubscribe headers." });

  // Transactional sending subdomain
  let hasTransactionalSubdomain = false;
  try {
    const mxRecords = await checkDnsRecord(`mail.${hostname}`, "MX");
    const mxSend = await checkDnsRecord(`send.${hostname}`, "MX");
    const mxEmail = await checkDnsRecord(`em.${hostname}`, "MX");
    hasTransactionalSubdomain = mxRecords.length > 0 || mxSend.length > 0 || mxEmail.length > 0;
  } catch { /* ignore */ }
  checks.push({ category: CATEGORY, checkKey: "transactional_subdomain", label: "Dedicated sending subdomain", status: hasTransactionalSubdomain ? "PASS" : "WARN", detail: hasTransactionalSubdomain ? "Dedicated email sending subdomain detected (mail.*, send.*, em.*)." : "No dedicated sending subdomain detected — use a subdomain (mail.yourdomain.com) for transactional email to protect your root domain's reputation." });

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

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT PRACTICES, READ FROM THE REPOSITORY.
//
// These checks were withdrawn in October 2026 because, as written, they searched a
// website's HTML for keywords. They were rebuilt here instead of being lost (Dan:
// "only remove if absolutely necessary"): each one now reads the code, manifests,
// templates and docs that actually show the practice.
//
// The same rule as repo-operations.ts: found in the repository is a PASS that names
// the files; not found is INCONCLUSIVE (the practice may live in a vendor dashboard),
// unless the files themselves prove a defect. A practice the product does not need
// at all (no payments, no email) is SKIPPED, and an optional one that is simply not
// used is NOT_APPLICABLE.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES, type CheckCategory } from "./categories";
import { stripYamlComments, workflowFiles } from "./ci-workflows";
import { isVendoredPath, sampleCoverage, type RepoSnapshot } from "./native-mobile";
import { classifyEmailPaths } from "./repo-operations";

export const REPO_PRACTICE_KEYS = [
  "deployment_frequency_tracking",
  "custom_business_metrics",
  "casl_double_optin",
  "mailing_list_segmentation",
  "email_warm_up_signals",
  "plain_text_email",
  "can_spam_address",
  "gdpr_breach_notification",
  "gdpr_records_processing",
  "esignature_support",
  "chargeback_prevention",
  "fraud_detection_tool",
  "otp_attempt_limiting",
  "otp_resend_cooldown",
  "stale_bot_configured",
] as const;
type Key = (typeof REPO_PRACTICE_KEYS)[number];

const META: Record<Key, { label: string; category: CheckCategory }> = {
  deployment_frequency_tracking: { label: "Deployments are recorded", category: CATEGORIES.OBSERVABILITY },
  custom_business_metrics: { label: "Product events are tracked from the server", category: CATEGORIES.OBSERVABILITY },
  casl_double_optin: { label: "Mailing-list sign-ups are confirmed by email", category: CATEGORIES.EMAIL },
  mailing_list_segmentation: { label: "Email contacts are segmented", category: CATEGORIES.EMAIL },
  email_warm_up_signals: { label: "Email is sent through a dedicated provider", category: CATEGORIES.EMAIL },
  plain_text_email: { label: "Emails include a plain-text version", category: CATEGORIES.EMAIL },
  can_spam_address: { label: "Marketing emails include a postal address", category: CATEGORIES.EMAIL },
  gdpr_breach_notification: { label: "A data-breach procedure is written down", category: CATEGORIES.LEGAL },
  gdpr_records_processing: { label: "Records of processing are kept (GDPR Art. 30)", category: CATEGORIES.LEGAL },
  esignature_support: { label: "Contracts can be signed electronically", category: CATEGORIES.BUSINESS_OPS },
  chargeback_prevention: { label: "Card disputes are handled in the product", category: CATEGORIES.PAYMENTS },
  fraud_detection_tool: { label: "Card payments are screened for fraud", category: CATEGORIES.PAYMENTS },
  otp_attempt_limiting: { label: "One-time codes lock out after repeated wrong guesses", category: CATEGORIES.AUTHENTICATION },
  otp_resend_cooldown: { label: "One-time codes cannot be resent without a wait", category: CATEGORIES.AUTHENTICATION },
  stale_bot_configured: { label: "Inactive issues and pull requests are triaged automatically", category: CATEGORIES.CODE_QUALITY },
};

function row(key: Key, status: PulseScanCheckInput["status"], detail: string, confidence: "HIGH" | "MEDIUM" | "LOW", evidence?: unknown): PulseScanCheckInput {
  return {
    category: META[key].category,
    checkKey: key,
    label: META[key].label,
    status,
    detail,
    confidence,
    ...(status === "PASS" || status === "WARN" || status === "FAIL" ? { evidenceStrength: "VERIFIED" as const } : {}),
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 600) } : {}),
  };
}

type File = { path: string; text: string };

const MANIFEST = /(^|\/)(package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml|Gemfile|go\.mod|composer\.json|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml)$/i;
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|php|java|kt|cs)$/i;
const NOT_SHIPPED = /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|fixtures?|examples?|scripts)\/|\.(test|spec)\.[a-z]+$/i;
const DOC = /\.(md|mdx|rst|txt|adoc)$/i;

function hits(files: File[], re: RegExp, filter?: (f: File) => boolean): { path: string; match: string }[] {
  const out: { path: string; match: string }[] = [];
  for (const f of files) {
    if (filter && !filter(f)) continue;
    re.lastIndex = 0;
    const m = re.exec(f.text);
    if (m) out.push({ path: f.path, match: m[0].replace(/\s+/g, " ").slice(0, 70) });
  }
  return out;
}
const named = (h: { path: string; match: string }[]) => h.slice(0, 4).map((x) => `${x.path} (${x.match.trim()})`).join(", ");
const isManifest = (f: File) => MANIFEST.test(f.path);
const isSource = (f: File) => SOURCE.test(f.path) && !NOT_SHIPPED.test(f.path);

// ─── Evidence ─────────────────────────────────────────────────────────────────

/** Platforms that keep a deployment history on their own. */
const PLATFORM_CONFIG = /(^|\/)(vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml|railway\.(json|toml)|app\.ya?ml|apprunner\.ya?ml|amplify\.ya?ml|firebase\.json|wrangler\.(toml|jsonc?)|Procfile)$/i;
const DEPLOY_STEP = /\b(deploy|publish|release)\b/i;

const SERVER_ANALYTICS =
  /["'](posthog-node|@segment\/analytics-node|analytics-node|mixpanel|@amplitude\/analytics-node|@rudderstack\/rudder-sdk-node|@june-so\/analytics-node)["']\s*:|^\s*(posthog|analytics-python|segment-analytics-python|mixpanel|amplitude-analytics)\b|\bgem\s+["'](posthog-ruby|analytics-ruby|mixpanel-ruby)["']/im;
const EVENT_CALL = /\b(?:posthog|analytics|mixpanel|amplitude|client)\.(?:capture|track)\s*\(/;

const MARKETING_SDK =
  /["'](@mailchimp\/mailchimp_marketing|mailchimp-api-v3|@klaviyo\/api|klaviyo-api|loops|@sendgrid\/client|convertkit-api|@getbrevo\/brevo|sib-api-v3-sdk|customerio-node|@beehiiv\/sdk)["']\s*:|^\s*(mailchimp3|mailchimp-marketing|klaviyo-api|loops-py|convertkit)\b/im;
const SUBSCRIBE_CODE = /\b(newsletter|mailing[ _-]?list|subscribe(?:r|rs|To)?)\b/i;
const DOUBLE_OPT_IN = /double[ _-]?opt[ _-]?in|confirm (?:your )?(?:subscription|email address)|status(?:_if_new)?["']?\s*:\s*["']pending["']|confirmation[ _-]?email|verify (?:your )?subscription/i;
const SEGMENTATION = /\btags?\s*:\s*\[|\bsegment(?:s|_id|Id)?\s*:|\blist_?[iI]ds?\s*:|\baudience(?:_id|Id)?\s*:|\bcontactProperties\b|\bproperties\s*:\s*\{|merge_fields|\bmailchimp\.lists\.updateListMemberTags\b|\bupdateProfile\b|\bsegmentId\b/;

const ESP_DEP =
  /["'](resend|postmark|@sendgrid\/mail|mailgun\.js|mailgun-js|@aws-sdk\/client-sesv?2?|aws-sdk|@sparkpost\/[\w-]+|sparkpost|@mailchimp\/mailchimp_transactional|mandrill-api|@getbrevo\/brevo|sib-api-v3-sdk|loops|mailersend|@plunk\/node|nodemailer-postmark-transport)["']\s*:|^\s*(sendgrid|postmarker|resend|mailgun|boto3|django-anymail|django-ses)\b|\bgem\s+["'](postmark-rails|sendgrid-ruby|mailgun-ruby|aws-sdk-ses|resend)["']/im;
const SMTP_ONLY = /["']nodemailer["']\s*:|^\s*smtplib\b|ActionMailer::Base\.smtp_settings|\bsmtp\.[\w-]+\.(?:com|net|org)\b/im;

const PLAIN_TEXT_PART = /\btext\s*:\s*[^,}\n]{2,}|\bTextBody\b|\bplainText\s*:\s*true|toPlainText\s*\(|render\([^)]*plainText|Text\s*:\s*\{\s*(?:Data|Charset)|\.text\.erb|text_template|txt_template/;
/** A file that sends an email (provider SDK call or SMTP send), not one that only renders a template. */
const SENDS_MAIL = /\b(?:sendMail|sendEmail|emails\.send|createEmail|sendTransacEmail|messages\.create|mail\.send|sgMail\.send|SendEmailCommand|send_mail|deliver_now|deliver_later)\b/;
const HTML_SEND = /\b(?:sendMail|send|sendEmail|createEmail|emails\.send)\s*\(\s*\{[\s\S]{0,400}?\bhtml\s*:/;
const ADDRESS = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Square|Sq)\b|\bP\.?\s?O\.?\s+Box\s+\d+|(?<![#\w])[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b|\b(?:company|business|postal|mailing|physical)[_ ]?address\b|\{\{\s*[\w.]*address[\w.]*\s*\}\}|\$\{[\w.]*address[\w.]*\}|\{[\w.]*[aA]ddress[\w.]*\}/;
const UNSUBSCRIBE = /unsubscribe|list-unsubscribe|email[ -]preferences/i;

const BREACH_DOC = /data[ -]breach|personal data breach|breach notification|within 72 hours|supervisory authority|information commissioner|\bICO\b/i;
const ROPA_PATH = /(^|\/)[^/]*(ropa|records?[-_ ]of[-_ ]processing|processing[-_ ]activities|data[-_ ](?:inventory|map|register))[^/]*\.(md|mdx|csv|xlsx?|json|ya?ml|pdf)$/i;

const ESIGN_DEP = /["'](docusign-esign|@docusign\/[\w-]+|@dropbox\/sign|hellosign-sdk|pandadoc-node-client|@documenso\/embed[\w-]*|docuseal|@docuseal\/[\w-]+|signwell|@signwell\/[\w-]+|@boldsign\/[\w-]+|zoho-sign)["']\s*:|^\s*(docusign-esign|dropbox-sign|pandadoc-api-client)\b/im;

const STRIPE_DEP = /["'](stripe|@stripe\/stripe-js|@stripe\/react-stripe-js)["']\s*:|^\s*stripe\b|\bgem\s+["']stripe["']|github\.com\/stripe\/stripe-go/im;
const OTHER_PSP = /["'](@adyen\/api-library|@adyen\/adyen-web|braintree|braintree-web|@paypal\/checkout-server-sdk|@paddle\/paddle-node-sdk|@paddle\/paddle-js|@lemonsqueezy\/lemonsqueezy\.js|square|@mollie\/api-client|gocardless-nodejs|checkout-sdk-node)["']\s*:|^\s*(adyen|braintree|paddle|mollie-api-python|gocardless_pro)\b/im;
const MERCHANT_OF_RECORD = /@paddle\/|lemonsqueezy|\bpaddle\b|fastspring/i;
const STRIPE_WEBHOOK = /stripe\.webhooks\.constructEvent|Stripe::Webhook\.construct_event|stripe\.Webhook\.construct_event|webhook\.ConstructEvent/;
const DISPUTE_HANDLING = /charge\.dispute\.|["']dispute\.|radar\.early_fraud_warning/;

const MANAGED_OTP =
  /["'](@clerk\/[\w-]+|@supabase\/supabase-js|@supabase\/auth-js|firebase|firebase-admin|@auth0\/[\w-]+|auth0|stytch|@stytch\/[\w-]+|@magic-sdk\/[\w-]+|magic-sdk|@aws-amplify\/auth|amazon-cognito-identity-js|@descope\/[\w-]+|@workos-inc\/[\w-]+|@kinde-oss\/[\w-]+|@ory\/[\w-]+)["']\s*:/;
const TWILIO_VERIFY = /verify\.v2\.services|\.verifications\.create|\.verificationChecks\.create/;
const OTP_SUBJECT = /\b(?:otp|one[_ -]?time[_ -]?(?:code|password)|verification[_ -]?code|login[_ -]?code|magic[_ -]?code|2fa[_ -]?code)\b/i;
const OTP_GENERATED = /randomInt\(\s*100000\s*,\s*999999|Math\.floor\(\s*100000\s*\+\s*Math\.random\(\)\s*\*\s*900000|secrets\.randbelow\(\s*(?:10\*\*6|1000000)|\brandom\.randint\(\s*100000\s*,\s*999999|SecureRandom\.random_number\(\s*(?:10\*\*6|1_?000_?000)|\bgenerateOtp\b|\bgenerate_otp\b|\bcreateOtp\b|speakeasy\.totp|otplib|pyotp/;
const OTP_ATTEMPTS = /\b(?:attempts?|tries|failedAttempts?|failed_attempts?|failure_?count|wrongAttempts?|max_?attempts|MAX_ATTEMPTS|attemptCount)\b/;
const OTP_COOLDOWN = /\b(?:cooldown|resendAfter|resend_after|lastSentAt|last_sent_at|sentAt|canResendAt|resendAvailableAt|RESEND_INTERVAL|resend_interval)\b|rate[-_ ]?limit|Ratelimit|throttle/i;

const STALE_PATH = /^\.github\/(stale|no-response|lock)\.ya?ml$/i;
const STALE_WORKFLOW = /actions\/stale@|dessant\/lock-threads|probot\/stale/;

// ─── Evaluation ──────────────────────────────────────────────────────────────

export function evaluateRepoPracticeChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const files: File[] = [...snapshot.files].filter(([p]) => !isVendoredPath(p)).map(([path, text]) => ({ path, text }));
  const paths = snapshot.paths.filter((p) => !isVendoredPath(p));
  const workflows = workflowFiles(snapshot).map((w) => ({ path: w.path, text: stripYamlComments(w.text) }));
  const source = files.filter(isSource);
  const totalSource = paths.filter((p) => SOURCE.test(p) && !NOT_SHIPPED.test(p)).length;
  const coverage = sampleCoverage(source.length, totalSource, snapshot.truncated);
  const out: PulseScanCheckInput[] = [];
  const manifestHas = (re: RegExp) => hits(files, re, isManifest);

  // Deployments recorded: GitHub records each run of a job with an `environment:`; hosting
  // platforms keep their own deployment history.
  {
    const envJobs = workflows.filter((w) => /^\s{2,}environment\s*:/m.test(w.text) && DEPLOY_STEP.test(w.text)).map((w) => ({ path: w.path, match: "environment:" }));
    const platform = paths.filter((p) => PLATFORM_CONFIG.test(p)).map((p) => ({ path: p, match: "hosting config" }));
    const h = [...envJobs, ...platform];
    out.push(h.length > 0
      ? row("deployment_frequency_tracking", "PASS", `Each deployment is recorded: ${named(h)}. ${envJobs.length ? "GitHub lists every deployment to an environment, with its commit and time." : "The hosting platform keeps a history of every deployment."}`, "HIGH", h.slice(0, 6))
      : row("deployment_frequency_tracking", "INCONCLUSIVE", "No deployment workflow with a GitHub environment, and no hosting platform config, was found. Deployments may still be recorded by a tool configured outside the repository.", "LOW"));
  }

  // Product events from the server.
  {
    const h = [...manifestHas(SERVER_ANALYTICS), ...hits(source, EVENT_CALL)];
    out.push(h.length > 0
      ? row("custom_business_metrics", "PASS", `Product events are recorded from the server: ${named(h)}.`, "HIGH", h.slice(0, 6))
      : row("custom_business_metrics", "INCONCLUSIVE", "No server-side product analytics (PostHog, Segment, Mixpanel, Amplitude) was found. Business events may be tracked in the browser or in a data warehouse instead, which this does not show.", "LOW"));
  }

  // Mailing lists: double opt-in and segmentation.
  {
    const marketing = manifestHas(MARKETING_SDK);
    const subscribeCode = hits(source, SUBSCRIBE_CODE);
    const usesList = marketing.length > 0 || subscribeCode.length > 0;
    const optIn = hits([...source, ...files.filter((f) => /\.(tsx|jsx|html?|mjml|hbs|erb|md)$/i.test(f.path))], DOUBLE_OPT_IN);
    out.push(!usesList
      ? row("casl_double_optin", "SKIPPED", "No mailing-list sign-up was found in the repository.", "MEDIUM")
      : optIn.length > 0
        ? row("casl_double_optin", "PASS", `Sign-ups are confirmed by email before mail is sent: ${named(optIn)}. Canada's CASL and Germany's courts expect this proof of consent.`, "HIGH", optIn.slice(0, 6))
        : row("casl_double_optin", "INCONCLUSIVE", "The project collects mailing-list sign-ups but no confirmation step was found in the code. Mailchimp, Klaviyo and similar tools can send the confirmation themselves, which is set in their dashboard.", "LOW"));
    const seg = hits(source, SEGMENTATION, (f) => MARKETING_SDK.test(f.text) || /mailchimp|klaviyo|loops|convertkit|brevo|customerio|audience/i.test(f.text));
    out.push(marketing.length === 0
      ? row("mailing_list_segmentation", "SKIPPED", "No email marketing tool is used in the code.", "MEDIUM")
      : seg.length > 0
        ? row("mailing_list_segmentation", "PASS", `Contacts are sent to the email tool with tags or properties, so they can be segmented: ${named(seg)}.`, "MEDIUM", seg.slice(0, 6))
        : row("mailing_list_segmentation", "INCONCLUSIVE", `An email marketing tool is used (${named(marketing)}) but no tags or contact properties are sent from the code. Segments may still be built in the tool itself.`, "LOW"));
  }

  // Sending: provider, plain-text part, postal address.
  {
    const esp = manifestHas(ESP_DEP);
    const smtp = hits(files, SMTP_ONLY, (f) => isManifest(f) || isSource(f));
    out.push(esp.length > 0
      ? row("email_warm_up_signals", "PASS", `Email goes through a dedicated sending provider, which manages sending reputation and bounces: ${named(esp)}.`, "HIGH", esp.slice(0, 6))
      : smtp.length > 0
        ? row("email_warm_up_signals", "INCONCLUSIVE", `Email is sent over SMTP (${named(smtp)}). Whether that server is a reputable provider (Postmark, SES, SendGrid) or a self-run mail server is set in configuration Pulse cannot read.`, "LOW")
        : row("email_warm_up_signals", "SKIPPED", "The code does not send email.", "MEDIUM"));

    const { templates } = classifyEmailPaths(paths);
    const railsHtml = templates.filter((p) => /\.html\.erb$/.test(p));
    const railsTextMissing = railsHtml.filter((p) => !paths.includes(p.replace(/\.html\.erb$/, ".text.erb")));
    // Only files that SEND mail: a template's `text:` prop is not the email's text part (dub).
    const textPart = [...hits(source, PLAIN_TEXT_PART, (f) => SENDS_MAIL.test(f.text)),
      ...railsHtml.filter((p) => !railsTextMissing.includes(p)).map((p) => ({ path: p, match: "has a .text.erb partner" }))];
    const htmlOnlySends = hits(source, HTML_SEND).filter((h) => !PLAIN_TEXT_PART.test(source.find((f) => f.path === h.path)?.text ?? ""));
    if (esp.length === 0 && smtp.length === 0 && templates.length === 0) {
      out.push(row("plain_text_email", "SKIPPED", "The code does not send email.", "MEDIUM"));
    } else if (railsTextMissing.length > 0) {
      out.push(row("plain_text_email", "WARN", `Rails mailer views have an HTML version but no .text.erb partner, so those emails go out HTML-only: ${railsTextMissing.slice(0, 4).join(", ")}. Some mail clients and spam filters score HTML-only mail lower. Add a .text.erb beside each.`, "HIGH", railsTextMissing.slice(0, 6)));
    } else if (textPart.length > 0) {
      out.push(row("plain_text_email", "PASS", `Emails are sent with a plain-text part: ${named(textPart)}.`, "MEDIUM", textPart.slice(0, 6)));
    } else if (htmlOnlySends.length > 0 && coverage >= 0.3) {
      out.push(row("plain_text_email", "INCONCLUSIVE", `Emails are sent with HTML and no text field (${named(htmlOnlySends)}). Some providers (Resend, SendGrid's plain-content setting) generate the text version themselves; others send HTML only. Pass a text version to be sure.`, "LOW"));
    } else {
      out.push(row("plain_text_email", "INCONCLUSIVE", "Pulse could not tell whether emails carry a plain-text part from the files it read.", "LOW"));
    }

    const marketingTemplates = templates.filter((p) => UNSUBSCRIBE.test(snapshot.files.get(p) ?? ""));
    const withAddress = templates.filter((p) => ADDRESS.test(snapshot.files.get(p) ?? ""));
    const allRead = templates.every((p) => snapshot.files.has(p));
    if (templates.length === 0) {
      out.push(row("can_spam_address", "SKIPPED", "No email templates were found.", "MEDIUM"));
    } else if (withAddress.length > 0) {
      out.push(row("can_spam_address", "PASS", `Email templates include a postal address: ${withAddress.slice(0, 4).join(", ")}.`, "HIGH", withAddress.slice(0, 6)));
    } else if (marketingTemplates.length > 0 && allRead) {
      out.push(row("can_spam_address", "WARN", `Marketing emails (they carry an unsubscribe link) have no postal address: ${marketingTemplates.slice(0, 4).join(", ")}. The US CAN-SPAM Act requires a valid physical postal address in every commercial email. Add it to the footer.`, "MEDIUM", marketingTemplates.slice(0, 6)));
    } else {
      out.push(row("can_spam_address", "INCONCLUSIVE", marketingTemplates.length === 0
        ? "None of the email templates read is a marketing email (none has an unsubscribe link). CAN-SPAM's postal address applies to commercial email, which may be sent from a marketing tool that adds the address itself."
        : "Some email templates were not read, and the address may be set in a shared footer among them.", "LOW"));
    }
  }

  // Data protection: breach procedure, records of processing.
  {
    const docs = files.filter((f) => DOC.test(f.path) || /SECURITY|INCIDENT|RUNBOOK/i.test(f.path));
    const breach = hits(docs, BREACH_DOC);
    out.push(breach.length > 0
      ? row("gdpr_breach_notification", "PASS", `A breach procedure is written down: ${named(breach)}. UK and EU GDPR (Art. 33/34) require reporting a qualifying breach to the regulator within 72 hours.`, "MEDIUM", breach.slice(0, 6))
      : row("gdpr_breach_notification", "INCONCLUSIVE", "No breach procedure was found in the repository's documents. It is often kept in a company handbook or policy system instead.", "LOW"));
    const ropa = paths.filter((p) => ROPA_PATH.test(p));
    out.push(ropa.length > 0
      ? row("gdpr_records_processing", "PASS", `Records of processing are kept in the repository: ${ropa.slice(0, 4).join(", ")}.`, "HIGH", ropa.slice(0, 6))
      : row("gdpr_records_processing", "INCONCLUSIVE", "No record of processing activities was found in the repository. GDPR Art. 30 requires one for most organisations, but it is usually kept outside the code.", "LOW"));
  }

  // E-signature.
  {
    const h = manifestHas(ESIGN_DEP);
    out.push(h.length > 0
      ? row("esignature_support", "PASS", `Contracts can be signed electronically: ${named(h)}.`, "HIGH", h.slice(0, 6))
      : row("esignature_support", "NOT_APPLICABLE", "No e-signature integration is used. That is a product choice, not a gap.", "MEDIUM"));
  }

  // Payments: fraud screening and disputes.
  {
    const stripe = manifestHas(STRIPE_DEP);
    const other = manifestHas(OTHER_PSP);
    const mor = other.filter((h) => MERCHANT_OF_RECORD.test(h.match));
    if (stripe.length === 0 && other.length === 0) {
      out.push(row("fraud_detection_tool", "SKIPPED", "The code does not take card payments.", "MEDIUM"));
      out.push(row("chargeback_prevention", "SKIPPED", "The code does not take card payments.", "MEDIUM"));
    } else {
      out.push(stripe.length > 0
        ? row("fraud_detection_tool", "PASS", `Card payments go through Stripe (${named(stripe)}), and Stripe Radar screens every card payment for fraud by default.`, "MEDIUM", stripe.slice(0, 4))
        : mor.length > 0
          ? row("fraud_detection_tool", "PASS", `Payments go through a merchant of record (${named(mor)}), which screens for fraud and carries the liability.`, "MEDIUM", mor.slice(0, 4))
          : row("fraud_detection_tool", "INCONCLUSIVE", `Payments go through ${named(other)}. Whether its fraud screening is switched on is a setting in the provider's dashboard.`, "LOW"));
      const webhook = hits(source, STRIPE_WEBHOOK);
      const disputes = hits(source, DISPUTE_HANDLING);
      out.push(disputes.length > 0
        ? row("chargeback_prevention", "PASS", `The product reacts to card disputes: ${named(disputes)}. Responding with evidence before the deadline is what wins a dispute.`, "HIGH", disputes.slice(0, 6))
        : mor.length > 0 && stripe.length === 0
          ? row("chargeback_prevention", "PASS", `A merchant of record (${named(mor)}) handles disputes and chargebacks.`, "MEDIUM", mor.slice(0, 4))
          : row("chargeback_prevention", "INCONCLUSIVE", webhook.length > 0
            ? `Stripe webhooks are handled (${named(webhook)}) but no dispute events (charge.dispute.created) are. Stripe also emails the account owner, so disputes may be handled by hand; handling the event lets the product pause the customer and gather evidence.`
            : "No dispute handling was found in the code. Disputes may be handled by hand from the payment provider's dashboard.", "LOW"));
    }
  }

  // One-time codes.
  {
    const otpFiles = source.filter((f) => OTP_SUBJECT.test(f.text) || OTP_GENERATED.test(f.text));
    const custom = otpFiles.filter((f) => OTP_GENERATED.test(f.text));
    const managed = [...manifestHas(MANAGED_OTP), ...hits(source, TWILIO_VERIFY)];
    for (const [key, guard, what] of [
      ["otp_attempt_limiting", OTP_ATTEMPTS, "a limit on wrong guesses"],
      ["otp_resend_cooldown", OTP_COOLDOWN, "a wait before a code can be resent"],
    ] as const) {
      if (custom.length > 0) {
        const guarded = custom.filter((f) => guard.test(f.text));
        out.push(guarded.length > 0
          ? row(key, "PASS", `The project's own one-time codes have ${what}: ${guarded.slice(0, 3).map((f) => f.path).join(", ")}.`, "MEDIUM", guarded.slice(0, 6).map((f) => f.path))
          : coverage >= 0.3
            ? row(key, "WARN", `The project generates its own one-time codes (${custom.slice(0, 3).map((f) => f.path).join(", ")}) and no ${what} was found where they are handled. ${key === "otp_attempt_limiting" ? "A six-digit code with unlimited guesses can be brute-forced; invalidate it after five or so wrong attempts." : "Without one, anyone can trigger unlimited texts or emails, which costs money and floods the user."}`, "MEDIUM", custom.slice(0, 6).map((f) => f.path))
            : row(key, "INCONCLUSIVE", `The project generates its own one-time codes but Pulse read too little of the source (${Math.round(coverage * 100)}%) to say ${what} is missing.`, "LOW"));
      } else if (managed.length > 0 && otpFiles.length > 0) {
        out.push(row(key, "PASS", `One-time codes are handled by a managed service (${named(managed)}), which enforces ${what} itself.`, "MEDIUM", managed.slice(0, 4)));
      } else if (otpFiles.length > 0) {
        out.push(row(key, "INCONCLUSIVE", `One-time codes are used (${otpFiles.slice(0, 3).map((f) => f.path).join(", ")}) but Pulse could not find where they are generated or checked.`, "LOW"));
      } else {
        out.push(row(key, "SKIPPED", "The code does not use one-time codes.", "MEDIUM"));
      }
    }
  }

  // Stale issue triage: optional.
  {
    const h = [...paths.filter((p) => STALE_PATH.test(p)).map((p) => ({ path: p, match: "config" })),
      ...workflows.filter((w) => STALE_WORKFLOW.test(w.text)).map((w) => ({ path: w.path, match: "actions/stale" }))];
    out.push(h.length > 0
      ? row("stale_bot_configured", "PASS", `Inactive issues and pull requests are flagged automatically: ${named(h)}.`, "HIGH", h.slice(0, 6))
      : row("stale_bot_configured", "NOT_APPLICABLE", "No stale-issue automation is configured. It is optional; many projects triage by hand on purpose.", "HIGH"));
  }

  return out;
}

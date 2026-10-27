// The checks rebuilt from the withdrawn list (repo-practices.ts). Each rule both ways: the
// evidence that must pass it, and a neighbouring input that must not.

import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateRepoPracticeChecks } from "../repo-practices";

function snap(files: Record<string, string>, extra: string[] = []): RepoSnapshot {
  return { owner: "a", repo: "b", paths: [...Object.keys(files), ...extra], files: new Map(Object.entries(files)), truncated: false, accessible: true };
}
const run = (files: Record<string, string>, extra: string[] = []) => evaluateRepoPracticeChecks(snap(files, extra));
const st = (c: PulseScanCheckInput[], k: string) => c.find((x) => x.checkKey === k)?.status;

describe("deployments recorded", () => {
  it("passes a deploy workflow with a GitHub environment, or a hosting platform's config", () => {
    expect(st(run({ ".github/workflows/deploy.yml": "jobs:\n  deploy:\n    environment: production\n    steps:\n      - run: npm run deploy" }), "deployment_frequency_tracking")).toBe("PASS");
    expect(st(run({}, ["vercel.json"]), "deployment_frequency_tracking")).toBe("PASS");
  });
  it("does not count a CI test job with no environment", () => {
    expect(st(run({ ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: npm test" }), "deployment_frequency_tracking")).toBe("INCONCLUSIVE");
  });
});

describe("server-side product events", () => {
  it("passes a server analytics dependency or a capture call", () => {
    expect(st(run({ "package.json": `{"dependencies":{"posthog-node":"^4"}}` }), "custom_business_metrics")).toBe("PASS");
    expect(st(run({ "src/billing.ts": "analytics.track({ event: 'subscribed' })" }), "custom_business_metrics")).toBe("PASS");
  });
  it("does not count a browser-only analytics script", () => {
    expect(st(run({ "package.json": `{"dependencies":{"posthog-js":"^1"}}` }), "custom_business_metrics")).toBe("INCONCLUSIVE");
  });
});

describe("mailing lists", () => {
  const mc = { "package.json": `{"dependencies":{"@mailchimp/mailchimp_marketing":"^3"}}` };
  it("skips a project with no mailing list at all", () => {
    expect(st(run({ "src/a.ts": "x" }), "casl_double_optin")).toBe("SKIPPED");
    expect(st(run({ "src/a.ts": "x" }), "mailing_list_segmentation")).toBe("SKIPPED");
  });
  it("passes a pending (double opt-in) subscribe, and is INCONCLUSIVE without one", () => {
    expect(st(run({ ...mc, "src/subscribe.ts": `await mailchimp.lists.addListMember(id, { email_address, status: "pending" });` }), "casl_double_optin")).toBe("PASS");
    expect(st(run({ ...mc, "src/subscribe.ts": `await mailchimp.lists.addListMember(id, { email_address, status: "subscribed" });` }), "casl_double_optin")).toBe("INCONCLUSIVE");
  });
  it("passes contacts sent with tags, and is INCONCLUSIVE when only an address is sent", () => {
    expect(st(run({ ...mc, "src/subscribe.ts": `mailchimp.lists.addListMember(id, { email_address, tags: ["trial"] })` }), "mailing_list_segmentation")).toBe("PASS");
    expect(st(run({ ...mc, "src/subscribe.ts": `mailchimp.lists.addListMember(id, { email_address })` }), "mailing_list_segmentation")).toBe("INCONCLUSIVE");
  });
});

describe("sending", () => {
  it("passes a dedicated provider, and leaves plain SMTP open rather than failing it", () => {
    expect(st(run({ "package.json": `{"dependencies":{"resend":"^4"}}` }), "email_warm_up_signals")).toBe("PASS");
    expect(st(run({ "package.json": `{"dependencies":{"nodemailer":"^6"}}` }), "email_warm_up_signals")).toBe("INCONCLUSIVE");
    expect(st(run({ "package.json": `{"dependencies":{"react":"^19"}}` }), "email_warm_up_signals")).toBe("SKIPPED");
  });
  it("WARNs a Rails HTML mailer view with no .text.erb partner, and passes one that has it", () => {
    expect(st(run({ "app/views/user_mailer/welcome.html.erb": "<p>Hi</p>" }), "plain_text_email")).toBe("WARN");
    expect(st(run({ "app/views/user_mailer/welcome.html.erb": "<p>Hi</p>" }, ["app/views/user_mailer/welcome.text.erb"]), "plain_text_email")).toBe("PASS");
  });
  it("passes a send call with a text part", () => {
    expect(st(run({ "package.json": `{"dependencies":{"postmark":"^4"}}`, "src/mail.ts": `client.sendEmail({ From, To, HtmlBody: html, TextBody: text })` }), "plain_text_email")).toBe("PASS");
  });
  it("WARNs marketing templates without a postal address, and passes one with an address variable", () => {
    expect(st(run({ "emails/newsletter.tsx": `<Html><Text>News</Text><Link href={unsub}>Unsubscribe</Link></Html>` }), "can_spam_address")).toBe("WARN");
    expect(st(run({ "emails/newsletter.tsx": `<Html><Text>{company.address}</Text><Link href={unsub}>Unsubscribe</Link></Html>` }), "can_spam_address")).toBe("PASS");
  });
  it("does not ask a transactional-only template for a postal address", () => {
    expect(st(run({ "emails/reset.tsx": `<Html><Text>Reset your password</Text></Html>` }), "can_spam_address")).toBe("INCONCLUSIVE");
  });
});

describe("data protection", () => {
  it("passes a written breach procedure, and is INCONCLUSIVE without one", () => {
    expect(st(run({ "SECURITY.md": "## Data breach\nWe notify the ICO within 72 hours." }), "gdpr_breach_notification")).toBe("PASS");
    expect(st(run({ "SECURITY.md": "Report vulnerabilities to security@x." }), "gdpr_breach_notification")).toBe("INCONCLUSIVE");
  });
  it("passes a record of processing in the repository", () => {
    expect(st(run({}, ["docs/legal/records-of-processing.md"]), "gdpr_records_processing")).toBe("PASS");
    expect(st(run({}, ["docs/legal/terms.md"]), "gdpr_records_processing")).toBe("INCONCLUSIVE");
  });
});

describe("payments", () => {
  it("skips fraud and disputes when the code takes no payments", () => {
    expect(st(run({ "package.json": "{}" }), "fraud_detection_tool")).toBe("SKIPPED");
    expect(st(run({ "package.json": "{}" }), "chargeback_prevention")).toBe("SKIPPED");
  });
  it("passes Stripe (Radar on by default) and a merchant of record", () => {
    expect(st(run({ "package.json": `{"dependencies":{"stripe":"^17"}}` }), "fraud_detection_tool")).toBe("PASS");
    expect(st(run({ "package.json": `{"dependencies":{"@paddle/paddle-node-sdk":"^1"}}` }), "fraud_detection_tool")).toBe("PASS");
  });
  it("passes dispute handling, and is INCONCLUSIVE for webhooks that ignore disputes", () => {
    const stripe = { "package.json": `{"dependencies":{"stripe":"^17"}}` };
    expect(st(run({ ...stripe, "app/api/stripe/route.ts": `const e = stripe.webhooks.constructEvent(b, s, k); if (e.type === "charge.dispute.created") pause(e);` }), "chargeback_prevention")).toBe("PASS");
    expect(st(run({ ...stripe, "app/api/stripe/route.ts": `const e = stripe.webhooks.constructEvent(b, s, k); if (e.type === "checkout.session.completed") grant(e);` }), "chargeback_prevention")).toBe("INCONCLUSIVE");
  });
});

describe("one-time codes", () => {
  const otp = `const code = crypto.randomInt(100000, 999999); await db.otp.create({ data: { code } });`;
  it("passes home-made codes that count attempts and wait between resends", () => {
    const c = run({ "src/otp.ts": `${otp}\nif (row.attempts >= 5) throw new Error("locked");\nif (Date.now() - row.lastSentAt < 60_000) return;` });
    expect(st(c, "otp_attempt_limiting")).toBe("PASS");
    expect(st(c, "otp_resend_cooldown")).toBe("PASS");
  });
  it("WARNs home-made codes with neither, when most of the source was read", () => {
    const c = run({ "src/otp.ts": otp });
    expect(st(c, "otp_attempt_limiting")).toBe("WARN");
    expect(st(c, "otp_resend_cooldown")).toBe("WARN");
  });
  it("is INCONCLUSIVE when too little source was read to say a guard is missing", () => {
    const unread = Array.from({ length: 20 }, (_, i) => `src/m${i}.ts`);
    expect(st(run({ "src/otp.ts": otp }, unread), "otp_attempt_limiting")).toBe("INCONCLUSIVE");
  });
  it("passes codes handled by a managed auth service", () => {
    expect(st(run({ "package.json": `{"dependencies":{"@supabase/supabase-js":"^2"}}`, "src/login.ts": "await supabase.auth.signInWithOtp({ email }); // one-time code" }), "otp_attempt_limiting")).toBe("PASS");
  });
  it("skips a project without one-time codes", () => {
    expect(st(run({ "src/a.ts": "x" }), "otp_resend_cooldown")).toBe("SKIPPED");
  });
});

describe("e-signature and stale triage are optional", () => {
  it("passes when present and is not a finding when absent", () => {
    expect(st(run({ "package.json": `{"dependencies":{"@documenso/embed-react":"^0.1"}}` }), "esignature_support")).toBe("PASS");
    expect(st(run({ "package.json": "{}" }), "esignature_support")).toBe("NOT_APPLICABLE");
    expect(st(run({ ".github/workflows/stale.yml": "steps:\n  - uses: actions/stale@v9" }), "stale_bot_configured")).toBe("PASS");
    expect(st(run({}), "stale_bot_configured")).toBe("NOT_APPLICABLE");
  });
});

describe("false positives found on real repositories (Oct 2026)", () => {
  it("browser page-view analytics is not server-side product events (vercel/chatbot)", () => {
    expect(st(run({ "package.json": `{"dependencies":{"@vercel/analytics":"^1"}}` }), "custom_business_metrics")).toBe("INCONCLUSIVE");
  });
  it("a template library is not a sending provider (dub: @react-email)", () => {
    expect(st(run({ "package.json": `{"dependencies":{"@react-email/components":"^0.1"}}` }), "email_warm_up_signals")).toBe("SKIPPED");
  });
  it("a template's text prop is not the email's plain-text part (dub)", () => {
    const c = run({ "package.json": `{"dependencies":{"resend":"^4"}}`, "emails/wrapped.tsx": `<Button text: "Read the announcement" />`, "src/send.ts": `await resend.emails.send({ from, to, html })` });
    expect(st(c, "plain_text_email")).not.toBe("PASS");
  });
  it("a product's own workspace packages are not an e-signature integration (documenso)", () => {
    expect(st(run({ "package.json": `{"dependencies":{"@documenso/lib":"*"}}` }), "esignature_support")).toBe("NOT_APPLICABLE");
  });
  it("a CSS colour is not a UK postcode (cal.com: #D1D5DB)", () => {
    expect(st(run({ "emails/digest.tsx": `<div style={{ border: "1px solid #D1D5DB" }}><a href={u}>Unsubscribe</a></div>` }), "can_spam_address")).toBe("WARN");
    expect(st(run({ "emails/digest.tsx": `<p>Gitwork Ltd, Manchester M50 3UB</p><a href={u}>Unsubscribe</a>` }), "can_spam_address")).toBe("PASS");
  });
});

// The 16 checks rebuilt in October 2026 from the withheld list. Each had searched a
// website's HTML for keywords; each now reads the evidence that actually answers it.
// Every rule is tested both ways: an input that must produce the verdict, and a
// representative correct input that must not.

import { createServer, type Http2Server } from "node:http2";
import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { cloudwatchLogGroups, evaluateRepoOperationsChecks } from "../repo-operations";
import { privacyNoticeRightsChecks } from "../privacy-notice-rights";
import { buildQuery, dnsTtlHealthyCheck, parseAnswers, zoneCandidates } from "../authoritative-ttl";
import { earlyHintsCheck, observeEarlyHints } from "../early-hints";
import { evaluateAndroidExtendedChecks } from "../android-app-extended";
import { selectEmailTemplates } from "../native-repo";
import { RETIRED_CHECKS } from "../catalogue-compat";
import { WITHHELD } from "../check-relevance-data";

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const ops = (files: Record<string, string>, extra: string[] = []) => evaluateRepoOperationsChecks(snap(files, extra));
const statusOf = (checks: PulseScanCheckInput[], key: string) => checks.find((c) => c.checkKey === key)?.status;

describe("nothing is withheld any more", () => {
  it("has an empty WITHHELD list and 40 retired keys", () => {
    expect(Object.keys(WITHHELD)).toEqual([]);
    expect(Object.keys(RETIRED_CHECKS)).toHaveLength(40);
  });
});

describe("alerting, on-call and escalation", () => {
  it("passes on Terraform paging resources and Alertmanager receivers", () => {
    const checks = ops({
      "infra/paging.tf": `resource "pagerduty_service" "api" {}\nresource "pagerduty_schedule" "primary" {}\nresource "pagerduty_escalation_policy" "api" {}`,
      "monitoring/alertmanager.yml": "receivers:\n  - name: team\n    slack_configs:\n      - channel: '#alerts'",
    });
    expect(statusOf(checks, "alert_pagerduty_opsgenie")).toBe("PASS");
    expect(statusOf(checks, "on_call_configured")).toBe("PASS");
    expect(statusOf(checks, "alert_escalation")).toBe("PASS");
  });
  it("passes on a Prometheus alert rule", () => {
    expect(statusOf(ops({ "prometheus/rules.yml": "groups:\n  - name: api\n    rules:\n      - alert: HighErrorRate\n        expr: x > 1" }), "alert_pagerduty_opsgenie")).toBe("PASS");
  });
  it("is INCONCLUSIVE, never a WARN, when nothing is in code", () => {
    const checks = ops({ "package.json": `{"name":"x"}` });
    for (const key of ["alert_pagerduty_opsgenie", "on_call_configured", "alert_escalation", "cost_monitoring_signals", "synthetic_monitoring", "post_mortem_culture", "log_aggregation"]) {
      expect(statusOf(checks, key), key).toBe("INCONCLUSIVE");
    }
  });
  it("does not count a commented-out resource", () => {
    expect(statusOf(ops({ "main.tf": `# resource "pagerduty_service" "api" {}` }), "alert_pagerduty_opsgenie")).toBe("INCONCLUSIVE");
  });
  it("does not read an 'alert:' key in a CI workflow as an alert rule", () => {
    expect(statusOf(ops({ ".github/workflows/ci.yml": "jobs:\n  x:\n    steps:\n      - alert: true" }), "alert_pagerduty_opsgenie")).toBe("INCONCLUSIVE");
  });
});

describe("cloud cost", () => {
  it("passes on an AWS budget or Infracost in CI", () => {
    expect(statusOf(ops({ "budget.tf": `resource "aws_budgets_budget" "monthly" {}` }), "cost_monitoring_signals")).toBe("PASS");
    expect(statusOf(ops({ ".github/workflows/cost.yml": "steps:\n  - run: infracost breakdown --path ." }), "cost_monitoring_signals")).toBe("PASS");
  });
});

describe("log shipping and retention", () => {
  it("passes on a logging transport dependency", () => {
    expect(statusOf(ops({ "package.json": `{"dependencies":{"@logtail/pino":"^0.4.0"}}` }), "log_aggregation")).toBe("PASS");
  });
  it("passes on a Compose log driver and a shipper config file", () => {
    expect(statusOf(ops({ "docker-compose.yml": "services:\n  api:\n    logging:\n      driver: awslogs" }), "log_aggregation")).toBe("PASS");
    expect(statusOf(ops({}, ["deploy/fluent-bit.conf"]), "log_aggregation")).toBe("PASS");
  });
  it("does not count a plain logger as shipping", () => {
    expect(statusOf(ops({ "package.json": `{"dependencies":{"pino":"^9.0.0","winston":"^3.0.0"}}` }), "log_aggregation")).toBe("INCONCLUSIVE");
  });
  it("WARNs on a CloudWatch log group with no retention, and treats 0 as forever", () => {
    const warn = ops({ "logs.tf": `resource "aws_cloudwatch_log_group" "api" {\n  name = "/ecs/api"\n}` });
    expect(statusOf(warn, "log_retention_policy")).toBe("WARN");
    expect(warn.find((c) => c.checkKey === "log_retention_policy")?.detail).toContain("aws_cloudwatch_log_group.api");
    expect(statusOf(ops({ "logs.tf": `resource "aws_cloudwatch_log_group" "api" {\n  retention_in_days = 0\n}` }), "log_retention_policy")).toBe("WARN");
  });
  it("passes a log group that sets retention", () => {
    expect(statusOf(ops({ "logs.tf": `resource "aws_cloudwatch_log_group" "api" {\n  name = "/ecs/api"\n  retention_in_days = 30\n}` }), "log_retention_policy")).toBe("PASS");
  });
  it("reads each block on its own: one unretained group among retained ones still warns", () => {
    const groups = cloudwatchLogGroups(`resource "aws_cloudwatch_log_group" "a" { retention_in_days = 14 }\nresource "aws_cloudwatch_log_group" "b" { tags = { x = "y" } }`);
    expect(groups).toEqual([{ name: "a", retained: true }, { name: "b", retained: false }]);
  });
  it("is INCONCLUSIVE with no log store in code", () => {
    expect(statusOf(ops({ "main.tf": `resource "aws_s3_bucket" "x" {}` }), "log_retention_policy")).toBe("INCONCLUSIVE");
  });
});

describe("incident reviews", () => {
  it("passes on postmortem documents", () => {
    expect(statusOf(ops({}, ["docs/postmortems/2026-03-01-outage.md"]), "post_mortem_culture")).toBe("PASS");
  });
  it("does not count application code in an incidents folder", () => {
    expect(statusOf(ops({}, ["src/incidents/IncidentList.md", "app/incidents/page.tsx"]), "post_mortem_culture")).toBe("INCONCLUSIVE");
  });
});

describe("synthetic monitoring", () => {
  it("passes on Checkly config or a Datadog synthetic in Terraform", () => {
    expect(statusOf(ops({}, ["checkly.config.ts"]), "synthetic_monitoring")).toBe("PASS");
    expect(statusOf(ops({ "mon.tf": `resource "datadog_synthetics_test" "home" {}` }), "synthetic_monitoring")).toBe("PASS");
  });
  it("passes on a scheduled workflow that runs a browser test", () => {
    expect(statusOf(ops({ ".github/workflows/smoke.yml": "on:\n  schedule:\n    - cron: '*/15 * * * *'\njobs:\n  smoke:\n    steps:\n      - run: npx playwright test smoke" }), "synthetic_monitoring")).toBe("PASS");
  });
  it("does not count a scheduled workflow that only updates dependencies", () => {
    expect(statusOf(ops({ ".github/workflows/deps.yml": "on:\n  schedule:\n    - cron: '0 0 * * 1'\njobs:\n  x:\n    steps:\n      - run: npm update" }), "synthetic_monitoring")).toBe("INCONCLUSIVE");
  });
});

describe("automated accessibility tests", () => {
  it("passes on jest-axe, XCUITest audits or Android accessibility checks", () => {
    expect(statusOf(ops({ "package.json": `{"devDependencies":{"jest-axe":"^9.0.0"}}` }), "screen_reader_tested_signal")).toBe("PASS");
    expect(statusOf(ops({ "AppUITests/A11yTests.swift": "try app.performAccessibilityAudit()" }), "screen_reader_tested_signal")).toBe("PASS");
    expect(statusOf(ops({ "app/src/androidTest/MainTest.kt": "AccessibilityChecks.enable()" }), "screen_reader_tested_signal")).toBe("PASS");
  });
  it("does not count a lint plugin as testing", () => {
    expect(statusOf(ops({ "package.json": `{"devDependencies":{"eslint-plugin-jsx-a11y":"^6.0.0"}}` }), "screen_reader_tested_signal")).toBe("INCONCLUSIVE");
  });
});

describe("AI endpoint rate limiting", () => {
  const aiRoute = `import OpenAI from "openai";\nexport async function POST(req: Request) { const openai = new OpenAI(); return Response.json(await openai.chat.completions.create({ model: "x", messages: [] })); }`;
  it("is SKIPPED when no server route calls a model", () => {
    expect(statusOf(ops({ "app/api/users/route.ts": "export async function GET() {}" }), "ai_endpoint_rate_limited")).toBe("SKIPPED");
  });
  it("passes when the AI route uses a limiter", () => {
    expect(statusOf(ops({ "app/api/chat/route.ts": `import { Ratelimit } from "@upstash/ratelimit";\n${aiRoute}` }), "ai_endpoint_rate_limited")).toBe("PASS");
  });
  it("passes when global middleware limits every request", () => {
    expect(statusOf(ops({ "app/api/chat/route.ts": aiRoute, "middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";` }), "ai_endpoint_rate_limited")).toBe("PASS");
  });
  it("WARNs when the project uses no limiter anywhere and most source was read", () => {
    const checks = ops({ "app/api/chat/route.ts": aiRoute, "package.json": `{"dependencies":{"openai":"^4.0.0"}}` });
    expect(statusOf(checks, "ai_endpoint_rate_limited")).toBe("WARN");
  });
  it("is INCONCLUSIVE when a limiter exists elsewhere in the project", () => {
    expect(statusOf(ops({ "app/api/chat/route.ts": aiRoute, "lib/limits.ts": `import { RateLimiterMemory } from "rate-limiter-flexible";` }), "ai_endpoint_rate_limited")).toBe("INCONCLUSIVE");
  });
  it("is INCONCLUSIVE when little of the source was read", () => {
    const unread = Array.from({ length: 40 }, (_, i) => `src/m${i}.ts`);
    expect(statusOf(ops({ "app/api/chat/route.ts": aiRoute }, unread), "ai_endpoint_rate_limited")).toBe("INCONCLUSIVE");
  });
  it("recognises a project's own rate-limit helper (vercel/chatbot: checkIpRateLimit)", () => {
    expect(statusOf(ops({ "app/(chat)/api/chat/route.ts": `import { checkIpRateLimit } from "@/lib/ratelimit";\n${aiRoute}\nawait checkIpRateLimit(ip);` }), "ai_endpoint_rate_limited")).toBe("PASS");
  });
  it("does not treat a library module named server.ts as a route", () => {
    expect(statusOf(ops({ "lib/artifacts/server.ts": aiRoute }), "ai_endpoint_rate_limited")).toBe("SKIPPED");
  });
  it("does not treat a test file as an AI route", () => {
    expect(statusOf(ops({ "app/api/chat/route.test.ts": aiRoute }), "ai_endpoint_rate_limited")).toBe("SKIPPED");
  });
});

describe("email preview text", () => {
  it("is SKIPPED with no email templates", () => {
    expect(statusOf(ops({ "src/index.ts": "x" }), "email_preview_configured")).toBe("SKIPPED");
  });
  it("passes on a React Email <Preview> or an MJML preview", () => {
    expect(statusOf(ops({ "emails/welcome.tsx": `<Html><Preview>Welcome aboard</Preview></Html>` }), "email_preview_configured")).toBe("PASS");
    expect(statusOf(ops({ "templates/emails/reset.mjml": `<mjml><mj-head><mj-preview>Reset</mj-preview></mj-head></mjml>` }), "email_preview_configured")).toBe("PASS");
  });
  it("WARNs when templates exist and none sets preview text", () => {
    expect(statusOf(ops({ "emails/welcome.tsx": `<Html><Body><Text>Hello</Text></Body></Html>` }), "email_preview_configured")).toBe("WARN");
  });
  it("passes when the shared layout sets the preheader (openstatus _components/layout.tsx)", () => {
    expect(statusOf(ops({ "emails/welcome.tsx": "<Layout>Hi</Layout>", "emails/_components/layout.tsx": "<Preview>{preview}</Preview>" }), "email_preview_configured")).toBe("PASS");
  });
  it("is INCONCLUSIVE, not WARN, when a template or layout was not read", () => {
    expect(statusOf(ops({ "emails/welcome.tsx": "<Html>Hi</Html>" }, ["emails/layout.tsx"]), "email_preview_configured")).toBe("INCONCLUSIVE");
  });
  it("does not count components or the React Email preview app as templates (documenso)", () => {
    expect(statusOf(ops({ "packages/email/preview/app/root.tsx": "<div/>", "emails/components/button.tsx": "<a/>" }), "email_preview_configured")).toBe("SKIPPED");
  });
  it("does not count a Storybook accessibility panel as a test (mastodon)", () => {
    expect(statusOf(ops({ "package.json": `{"devDependencies":{"@storybook/addon-a11y":"^8.0.0"}}` }), "screen_reader_tested_signal")).toBe("INCONCLUSIVE");
  });
  it("selects at most six templates, marketing first, and never tests", () => {
    const paths = ["emails/a.tsx", "emails/b.tsx", "emails/c.tsx", "emails/d.tsx", "emails/e.tsx", "emails/f.tsx", "emails/newsletter.tsx", "emails/__tests__/x.tsx"];
    const chosen = selectEmailTemplates(paths);
    expect(chosen).toHaveLength(6);
    expect(chosen[0]).toBe("emails/newsletter.tsx");
    expect(chosen).not.toContain("emails/__tests__/x.tsx");
  });
});

describe("privacy notice rights", () => {
  const page = (body: string, lang = "en") => ({ url: "https://x.test/privacy", html: `<html lang="${lang}"><body><h1>Privacy Policy</h1>${body}</body></html>` });
  it("passes when the notice states each right", () => {
    const checks = privacyNoticeRightsChecks(page("<p>You have the right of access to your personal data and the right to data portability.</p>"));
    expect(statusOf(checks, "gdpr_right_to_access")).toBe("PASS");
    expect(statusOf(checks, "gdpr_right_to_portability")).toBe("PASS");
  });
  it("recognises the plain-English forms", () => {
    const checks = privacyNoticeRightsChecks(page("<p>You can request a copy of your personal information, and receive it in a machine-readable format.</p>"));
    expect(statusOf(checks, "gdpr_right_to_access")).toBe("PASS");
    expect(statusOf(checks, "gdpr_right_to_portability")).toBe("PASS");
  });
  it("reads a rights list split across items (gov.uk: 'the right to request: … a copy of that personal data')", () => {
    expect(statusOf(privacyNoticeRightsChecks(page("<p>You have the right to request:</p><ul><li>a copy of that personal data</li></ul>")), "gdpr_right_to_access")).toBe("PASS");
  });
  it("does not treat an in-page contents link as a separate rights page", () => {
    const checks = privacyNoticeRightsChecks(page(`<a href="#rights">Your rights and choices</a><p>We rely on your consent.</p>`));
    expect(statusOf(checks, "gdpr_right_to_access")).toBe("WARN");
  });
  it("leaves portability open when the notice relies on neither consent nor a contract", () => {
    const checks = privacyNoticeRightsChecks(page("<p>We process data to perform a task in the public interest.</p>"));
    expect(statusOf(checks, "gdpr_right_to_access")).toBe("WARN");
    expect(statusOf(checks, "gdpr_right_to_portability")).toBe("INCONCLUSIVE");
  });
  it("WARNs when an English notice says neither and relies on consent", () => {
    const checks = privacyNoticeRightsChecks(page("<p>We collect your email to send receipts, based on your consent.</p>"));
    expect(statusOf(checks, "gdpr_right_to_access")).toBe("WARN");
    expect(statusOf(checks, "gdpr_right_to_portability")).toBe("WARN");
  });
  it("is INCONCLUSIVE when the notice links a separate rights page", () => {
    expect(statusOf(privacyNoticeRightsChecks(page(`<p>See <a href="/rights">your privacy rights</a>.</p>`)), "gdpr_right_to_access")).toBe("INCONCLUSIVE");
  });
  it("is INCONCLUSIVE for a policy not in English, or none read", () => {
    expect(statusOf(privacyNoticeRightsChecks(page("<p>Wir verarbeiten Ihre Daten.</p>", "de")), "gdpr_right_to_access")).toBe("INCONCLUSIVE");
    expect(statusOf(privacyNoticeRightsChecks(null), "gdpr_right_to_access")).toBe("INCONCLUSIVE");
  });
  it("does not read the words inside a script as the notice", () => {
    expect(statusOf(privacyNoticeRightsChecks(page(`<script>var t = "right of access";</script><p>We collect email.</p>`)), "gdpr_right_to_access")).toBe("WARN");
  });
});

describe("DNS TTL from the authoritative servers", () => {
  it("walks to parent zones", () => {
    expect(zoneCandidates("www.app.example.co.uk")).toEqual(["www.app.example.co.uk", "app.example.co.uk", "example.co.uk", "co.uk"]);
  });
  it("WARNs over a day and passes at or under it", () => {
    expect(dnsTtlHealthyCheck("x.test", { kind: "ttl", ttl: 172_800, record: "A", server: "ns1", zone: "x.test" }).status).toBe("WARN");
    expect(dnsTtlHealthyCheck("x.test", { kind: "ttl", ttl: 86_400, record: "A", server: "ns1", zone: "x.test" }).status).toBe("PASS");
    expect(dnsTtlHealthyCheck("x.test", { kind: "ttl", ttl: 300, record: "A", server: "ns1", zone: "x.test" }).status).toBe("PASS");
  });
  it("never guesses when no server answered, and judges a CNAME by its own TTL", () => {
    expect(dnsTtlHealthyCheck("x.test", { kind: "unknown", reason: "no answer" }).status).toBe("INCONCLUSIVE");
    const cname = dnsTtlHealthyCheck("www.x.test", { kind: "ttl", ttl: 172_800, record: "CNAME", server: "ns1", zone: "x.test" });
    expect(cname.status).toBe("WARN");
    expect(cname.detail).toContain("CNAME record");
  });
  it("reads a CNAME's TTL from a raw answer, following a compressed name", () => {
    const id = 0x1234;
    const q = buildQuery(id, "www.x.test");
    // Header (QR=1, AA=1, one answer) + the question + one CNAME answer whose name is a
    // pointer back to the question (0xc00c), TTL 14400, rdata "a.b".
    const header = Buffer.from(q.subarray(0, 12));
    header.writeUInt16BE(0x8400, 2);
    header.writeUInt16BE(1, 6);
    const rdata = Buffer.from([1, 0x61, 1, 0x62, 0]);
    const rr = Buffer.alloc(12);
    rr.writeUInt16BE(0xc00c, 0); rr.writeUInt16BE(5, 2); rr.writeUInt16BE(1, 4); rr.writeUInt32BE(14400, 6); rr.writeUInt16BE(rdata.length, 10);
    const reply = Buffer.concat([header, q.subarray(12), rr, rdata]);
    expect(parseAnswers(reply, id)).toEqual({ rcode: 0, truncated: false, answers: [{ type: 5, ttl: 14400 }] });
    expect(() => parseAnswers(reply, id + 1)).toThrow();
  });
});

describe("103 Early Hints", () => {
  // A real HTTP/2 server on localhost (cleartext h2c, so no certificate is needed), so the
  // client path that reads 1xx header blocks is exercised rather than simulated.
  async function server(send103: boolean): Promise<{ url: string; close: () => Promise<void> }> {
    const srv: Http2Server = createServer((req, res) => {
      if (send103) res.writeEarlyHints({ link: "</app.css>; rel=preload; as=style" });
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => srv.close(() => r())) };
  }
  it("sees a 103 the server sends, and none when it does not", async () => {
    const withHints = await server(true);
    const without = await server(false);
    try {
      const a = await observeEarlyHints(withHints.url);
      expect(a.outcome).toBe("seen");
      expect(a.links.join()).toContain("app.css");
      expect((await observeEarlyHints(without.url)).outcome).toBe("none");
    } finally {
      await withHints.close();
      await without.close();
    }
  });
  it("maps outcomes to verdicts without claiming absence is a fault", () => {
    expect(earlyHintsCheck({ outcome: "seen", links: [] }).status).toBe("PASS");
    expect(earlyHintsCheck({ outcome: "none", links: [] }).status).toBe("NOT_APPLICABLE");
    expect(earlyHintsCheck({ outcome: "no-h2", links: [] }).status).toBe("NOT_APPLICABLE");
    expect(earlyHintsCheck({ outcome: "error", links: [], reason: "x" }).status).toBe("INCONCLUSIVE");
  });
});

describe("Android App Bundle reads the release pipeline", () => {
  const gradle = { "app/build.gradle.kts": `android { namespace = "a.b" }`, "app/src/main/AndroidManifest.xml": "<manifest/>" };
  const aab = (files: Record<string, string>) => evaluateAndroidExtendedChecks(snap({ ...gradle, ...files })).find((c) => c.checkKey === "android_x_app_bundle")?.status;
  it("passes a pipeline that builds a bundle", () => {
    expect(aab({ ".github/workflows/release.yml": "steps:\n  - run: ./gradlew bundleRelease\n  - uses: r0adkll/upload-google-play@v1" })).toBe("PASS");
  });
  it("WARNs a pipeline that uploads an APK to Play", () => {
    expect(aab({ ".github/workflows/release.yml": "steps:\n  - run: ./gradlew assembleRelease\n  - uses: r0adkll/upload-google-play@v1\n    with:\n      releaseFiles: app/build/outputs/apk/release/app-release.apk" })).toBe("WARN");
  });
  it("is SKIPPED, not WARN, when there is no release pipeline (any current AGP can build a bundle)", () => {
    expect(aab({})).toBe("SKIPPED");
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderReportEmail, type ReportEmailInput } from "@/server/pulse-lite/report-email";

const base: ReportEmailInput = {
  name: "Sam Buyer",
  targetUrl: "https://www.acme.test/pricing",
  score: 72,
  pass: 120,
  warn: 17,
  fail: 2,
  findings: [
    { label: "Content-Security-Policy", category: "Security", status: "FAIL", detail: "No Content-Security-Policy header was returned.", tier: "P1" },
    { label: "Cookie consent / GDPR", category: "Legal & Compliance", status: "WARN", detail: "Analytics cookies are set before consent.", tier: "P2" },
  ],
  advisoryCount: 40,
  notEstablishedCount: 3,
  reportPdfUrl: "https://foundry.gitwork.co.uk/api/public/pulse/report/tok123/pdf",
  bookingUrl: "https://example.com/book",
  logoUrl: "https://foundry.gitwork.co.uk/email/gitwork-wordmark-ink.png",
};

describe("the report email", () => {
  const { subject, html } = renderReportEmail(base);
  const text = html.replace(/<[^>]+>/g, " ");

  it("names the site and greets the visitor by first name", () => {
    expect(subject).toBe("Your Pulse report for acme.test");
    expect(text).toContain("Hi Sam,");
  });

  it("carries every finding with its evidence and the real figures", () => {
    for (const f of base.findings) {
      expect(text).toContain(f.label);
      expect(text).toContain(f.detail);
    }
    expect(text).toContain("72");
    expect(text).toContain("What to fix (2)");
  });

  it("follows the Gitwork copy rules: no em dashes, never 'free', the delivery line word for word", () => {
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/\bfree\b/i);
    expect(text).toContain("Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.");
  });

  it("never prints an em dash, even when the evidence has one", () => {
    const { html: h } = renderReportEmail({ ...base, findings: [{ ...base.findings[0], detail: "No header — set one." }] });
    expect(h).toContain("No header, set one.");
    expect(h).not.toMatch(/[—–]/);
  });

  it("paints the dark card and the button with bgcolor, which Gmail keeps", () => {
    // Gmail dropped the CSS background on the CTA, leaving cream text and a white
    // button label on white. bgcolor attributes survive every client.
    expect(html).toContain('bgcolor="#0C0C18"');
    expect(html).toMatch(/<td bgcolor="#6B52FF"[^>]*><a href=/);
    expect(html).not.toMatch(/[;"]background:/);
  });

  it("links the full report as a PDF, and nothing else on Foundry", () => {
    expect(text).toContain("Open your report (PDF)");
    expect(html).toContain('href="https://foundry.gitwork.co.uk/api/public/pulse/report/tok123/pdf"');
    expect(html).not.toContain("/scan/");
    expect(html).not.toContain("/report/tok123\"");
  });

  it("uses the placed wordmark, never the name set in a font", () => {
    expect(html).toContain('src="https://foundry.gitwork.co.uk/email/gitwork-wordmark-ink.png"');
  });

  it("escapes what came from the visitor or the scanned site", () => {
    const { html: h } = renderReportEmail({ ...base, name: "<script>x</script>", findings: [{ ...base.findings[0], label: "<img src=x onerror=1>" }] });
    expect(h).not.toContain("<script>x");
    expect(h).not.toContain("<img src=x");
  });
});

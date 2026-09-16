import { describe, expect, it } from "vitest";
import { renderReportMarkdown } from "../public-report";
import type { PublicReport } from "../public-report";

// ─────────────────────────────────────────────────────────────────────────────
// The Markdown variant is served from the same canonical URL as the HTML, so the
// two must describe the same scan. Both are derived from `getPublicReport`, and
// `renderReportMarkdown` is the only place the Markdown wording lives — these
// tests pin the properties that make it trustworthy to an agent:
//
//   · the score and band appear as text (no scraping required)
//   · every actionable finding carries its evidence
//   · the advisory tail is stated, not silently dropped
//   · "could not establish" is present with reasons — silence would read as a pass
//   · the scope disclaimer is unconditional
// ─────────────────────────────────────────────────────────────────────────────

function report(over: Partial<PublicReport> = {}): PublicReport {
  return {
    id: "scan_1",
    status: "COMPLETED",
    targetUrl: "https://acme.test/",
    targetHost: "acme.test",
    score: 64,
    band: "NEEDS WORK",
    techStack: ["Next.js", "Nginx"],
    scannedAt: "2026-08-22T01:00:00.000Z",
    measured: 900,
    pass: 300,
    warn: 598,
    fail: 2,
    inconclusive: 0,
    categories: [],
    triage: {
      actionable: [
        { checkKey: "privacy_policy", category: "Legal & Compliance", label: "Privacy Policy", status: "FAIL", detail: "No privacy policy link found.", tier: "P1" },
        { checkKey: "csp_header", category: "Security", label: "Content-Security-Policy", status: "WARN", detail: "No CSP header is sent.", tier: "P2" },
      ],
      advisoryCount: 588,
      advisoryByCategory: [{ category: "SEO", count: 300 }, { category: "Accessibility", count: 288 }],
      notEstablished: [
        { checkKey: "mfa", category: "Authentication", label: "Multi-factor authentication", reason: "No authentication system was detected." },
      ],
    },
    enquired: false,
    errorMessage: null,
    ...over,
  };
}

describe("the markdown report states the headline facts as text", () => {
  const md = renderReportMarkdown(report());

  it("names the host, the score and the band", () => {
    expect(md).toContain("# Pulse report for acme.test");
    expect(md).toContain("Score: 64/100 — NEEDS WORK");
  });

  it("states how much was measured and how much was not", () => {
    expect(md).toMatch(/900 checks were measured/);
    expect(md).toMatch(/1 could not be established/);
  });

  it("reports the detected stack when there is one", () => {
    expect(md).toContain("Detected stack: Next.js, Nginx");
  });
});

describe("every actionable finding carries its evidence", () => {
  const md = renderReportMarkdown(report());

  it("lists each finding with priority, result, category and evidence", () => {
    expect(md).toContain("### 1. Privacy Policy");
    expect(md).toContain("- Priority: P1");
    expect(md).toContain("- Result: FAIL");
    expect(md).toContain("- Category: Legal & Compliance");
    expect(md).toContain("- Evidence: No privacy policy link found.");
  });

  it("does not omit the second finding", () => {
    expect(md).toContain("### 2. Content-Security-Policy");
    expect(md).toContain("- Evidence: No CSP header is sent.");
  });

  it("says so plainly when nothing is actionable, rather than omitting the section", () => {
    const md2 = renderReportMarkdown(report({
      triage: { actionable: [], advisoryCount: 0, advisoryByCategory: [], notEstablished: [] },
    }));
    expect(md2).toContain("## What to fix");
    expect(md2).toMatch(/Nothing reached the actionable threshold/);
  });
});

describe("the advisory tail is stated, never dropped", () => {
  it("gives the count and the largest groups", () => {
    const md = renderReportMarkdown(report());
    expect(md).toMatch(/588 further lower-priority checks did not pass/);
    expect(md).toContain("SEO (300)");
    expect(md).toContain("Accessibility (288)");
  });

  it("omits the section entirely when there is no tail", () => {
    const md = renderReportMarkdown(report({
      triage: { actionable: [], advisoryCount: 0, advisoryByCategory: [], notEstablished: [] },
    }));
    expect(md).not.toContain("## Advisory");
  });
});

describe("'could not establish' is present with its reasons", () => {
  it("lists each unestablished check and why", () => {
    const md = renderReportMarkdown(report());
    expect(md).toContain("## Could not be established (1)");
    expect(md).toContain("**Multi-factor authentication** — No authentication system was detected.");
    expect(md).toMatch(/neither passes nor failures/);
  });

  it("caps a very long list but says how many were omitted", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      checkKey: `k${i}`, category: "App Store", label: `Check ${i}`, reason: "Needs a repository.",
    }));
    const md = renderReportMarkdown(report({
      triage: { actionable: [], advisoryCount: 0, advisoryByCategory: [], notEstablished: many },
    }));
    expect(md).toContain("## Could not be established (45)");
    expect(md).toMatch(/…and 5 more\./);
  });
});

describe("the scope disclaimer is unconditional", () => {
  it("is present even on a clean scan with nothing to report", () => {
    const md = renderReportMarkdown(report({
      score: 100, band: "EXCELLENT", fail: 0, warn: 0,
      triage: { actionable: [], advisoryCount: 0, advisoryByCategory: [], notEstablished: [] },
    }));
    // A reader must never have to infer the product's boundary from silence.
    expect(md).toContain("## Scope");
    expect(md).toMatch(/does not sign in, exercise payments, attempt authorisation/);
  });
});

describe("degenerate input", () => {
  it("renders an em dash rather than 'null' for a missing score", () => {
    const md = renderReportMarkdown(report({ score: null, band: "PENDING" }));
    expect(md).toContain("Score: —/100 — PENDING");
    expect(md).not.toContain("null");
  });

  it("never emits three consecutive newlines", () => {
    expect(renderReportMarkdown(report())).not.toMatch(/\n{3}/);
  });
});

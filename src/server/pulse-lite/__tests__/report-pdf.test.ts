// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildReportPdf, toWinAnsi, type ReportPdfInput } from "@/server/pulse-lite/report-pdf";

const base: ReportPdfInput = {
  targetUrl: "https://www.acme.test/",
  preparedFor: "Sam Buyer, Acme",
  scannedAt: new Date("2026-10-22T12:00:00Z"),
  score: 72,
  pass: 1,
  warn: 1,
  fail: 1,
  findings: [{ label: "Content-Security-Policy", category: "Security", status: "FAIL", detail: "No CSP header.", tier: "P1" }],
  checks: [
    { category: "Security", label: "Content-Security-Policy", status: "FAIL", detail: "No CSP header." },
    { category: "Security", label: "HSTS header", status: "PASS", detail: "max-age=31536000" },
    { category: "SEO", label: "Meta description", status: "WARN", detail: "Missing — add one “now” → please 😀" },
    { category: "Payments", label: "Stripe", status: "NOT_APPLICABLE", detail: null },
  ],
  logoPng: null,
};

describe("the full report PDF", () => {
  it("builds a valid PDF", async () => {
    const bytes = await buildReportPdf(base);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toBe("Pulse report for acme.test");
  });

  it("paginates a 900-check scan without throwing", async () => {
    const checks = Array.from({ length: 900 }, (_, i) => ({
      category: `Area ${i % 25}`, label: `Check ${i} with a reasonably long label to wrap`, status: i % 3 ? "PASS" : "WARN",
      detail: `Evidence for check ${i}: https://example.com/a/very/long/path/that/does/not/break/on/spaces/${"x".repeat(120)}`,
    }));
    const doc = await PDFDocument.load(await buildReportPdf({ ...base, checks }));
    expect(doc.getPageCount()).toBeGreaterThan(10);
  });

  it("survives evidence the built-in fonts cannot draw, and drops em dashes", () => {
    const t = toWinAnsi("Missing — add one “now” → please 😀");
    expect(t).not.toMatch(/[—“”→]/);
    expect(t).toBe('Missing, add one "now" -> please');
  });
});

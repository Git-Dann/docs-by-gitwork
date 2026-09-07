// @vitest-environment node
/**
 * The load-bearing claim of the public result page is that it is readable WITHOUT
 * JavaScript — the score must be in the first byte of HTML, because the embed
 * widget is a client component whose number only exists after hydration, and an
 * agent-readiness product that agents cannot read is the wrong look.
 *
 * `/scan/[id]` is auth-free but needs a database, and there is none locally (see
 * CLAUDE.md's local-verification note), so this stubs the one data function and
 * server-renders the real component — the technique CLAUDE.md §39.1 records for
 * verifying screens that cannot be reached in a browser here.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicReport } from "@/server/pulse-lite/public-report";

const REPORT: PublicReport = {
  id: "scan_abc123",
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
    advisoryByCategory: [{ category: "SEO", count: 300 }],
    notEstablished: [
      { checkKey: "mfa", category: "Authentication", label: "Multi-factor authentication", reason: "No authentication system was detected." },
    ],
  },
  enquired: false,
  errorMessage: null,
};

vi.mock("@/server/pulse-lite/public-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/pulse-lite/public-report")>();
  return { ...actual, getPublicReport: vi.fn(async () => REPORT) };
});
vi.mock("@/server/pulse-embed-workspace", () => ({
  getPulseEmbedWorkspaceConfig: vi.fn(async () => ({
    enabled: true,
    checkKeys: [],
    bookingUrl: "https://example.com/book",
    turnstileSiteKey: null,
    turnstileSecretKey: null,
  })),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ accept: "text/html" })) }));

let html = "";

beforeEach(async () => {
  const { default: PublicScanPage } = await import("@/app/scan/[id]/page");
  html = renderToStaticMarkup(await PublicScanPage({ params: Promise.resolve({ id: "scan_abc123" }) }));
});

describe("the score is in the server-rendered HTML", () => {
  it("contains the number with no JavaScript executed", () => {
    expect(html).toContain(">64<");
    expect(html).toContain("NEEDS WORK");
  });

  it("names the host and the scanned URL", () => {
    expect(html).toContain("acme.test");
    expect(html).toContain("https://acme.test/");
  });

  it("states how much was measured", () => {
    expect(html).toContain("900");
    expect(html).toContain("300");
  });
});

describe("the free report is fully present in the HTML", () => {
  it("renders every actionable finding WITH its evidence", () => {
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("No privacy policy link found.");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("No CSP header is sent.");
    expect(html).toContain("What to fix (2)");
  });

  it("states the advisory tail rather than hiding it", () => {
    expect(html).toContain("588");
    expect(html).toMatch(/lower-priority advisory checks/);
  });

  it("renders 'could not establish' with its reason", () => {
    expect(html).toContain("What we could not establish (1)");
    expect(html).toContain("No authentication system was detected.");
  });

  it("carries the scope disclaimer unconditionally", () => {
    expect(html).toMatch(/does not sign in, exercise payments/);
  });
});

describe("layout hazards", () => {
  it("lets long URLs wrap rather than forcing horizontal scroll", () => {
    // docs/mobile-playbook.md: a long unbroken string is the classic PAGE-X cause.
    expect(html).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("sets no fixed pixel width wider than a phone viewport", () => {
    const widths = [...html.matchAll(/[^-]width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(widths.filter((w) => w > 375)).toEqual([]);
  });
});

describe("markdown negotiation", () => {
  it("returns the markdown body when the client asks for text/markdown", async () => {
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ accept: "text/markdown" }) as never);
    const { default: PublicScanPage } = await import("@/app/scan/[id]/page");
    const md = renderToStaticMarkup(await PublicScanPage({ params: Promise.resolve({ id: "scan_abc123" }) }));
    expect(md).toContain("# Pulse report for acme.test");
    // Markdown, not the HTML page.
    expect(md).not.toContain("What we could not establish (1)");
  });
});

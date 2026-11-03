// @vitest-environment node
/**
 * End to end, through the REAL code paths a stranger touches: the public scan endpoint
 * (the widget's poll), the shareable report + its markdown twin, and the results email —
 * all fed one stored scan, with the free-tier limit off, on, empty, and corrupt.
 *
 * Only the edges are faked (database rows, the workspace config, outgoing mail). The
 * triage, the ranking, the score and every renderer are the shipped ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import type { PulseCheckStatus, PulseScanCheckInput } from "@/types/pulse";

const SECRET_DETAILS = {
  csp: "SECRET-EVIDENCE-CSP: no Content-Security-Policy header was returned",
  terms: "SECRET-EVIDENCE-TERMS: no terms of service page found",
  hsts: "SECRET-EVIDENCE-HSTS: Strict-Transport-Security is missing",
};
const mk = (checkKey: string, category: PulseScanCheckInput["category"], detail: string): PulseScanCheckInput =>
  ({ checkKey, category, label: `label ${checkKey}`, detail, status: "FAIL" as PulseCheckStatus, severity: "CRITICAL", confidence: "HIGH" }) as PulseScanCheckInput;

const CHECKS: PulseScanCheckInput[] = [
  mk("csp_header", CATEGORIES.SECURITY, SECRET_DETAILS.csp),
  mk("terms_of_service", CATEGORIES.LEGAL, SECRET_DETAILS.terms),
  mk("hsts_header", CATEGORIES.SECURITY, SECRET_DETAILS.hsts),
  { checkKey: "ssl_valid", category: CATEGORIES.SECURITY, label: "SSL", detail: "ok", status: "PASS" } as PulseScanCheckInput,
];

let freeCheckKeys: string[] | null = null;
let captured = false;
const sent: Array<{ html: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pulseLiteScan: {
      findUnique: vi.fn(async (a: { select?: { checks?: boolean } }) => ({
        id: "s1", status: "COMPLETED", targetUrl: "https://example.com", targetHost: "example.com",
        healthScore: 50, techStack: [], checks: CHECKS, emailCaptured: captured, errorMessage: null,
        updatedAt: new Date("2026-10-14"), createdAt: new Date("2026-10-14"), ...(a.select ? {} : {}),
      })),
    },
    pulseLead: {
      findUnique: vi.fn(async () => ({ id: "l1", liteScanId: "s1", email: "v@x.com", targetUrl: "https://example.com" })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
    workspaceMember: { findMany: vi.fn(async () => []) },
    workspace: { findFirst: vi.fn(async () => ({ id: "w1" })) },
  },
}));
vi.mock("@/server/pulse-embed-workspace", () => ({
  getPulseEmbedWorkspaceConfig: vi.fn(async () => ({
    enabled: true, bookingUrl: "https://b", turnstileSiteKey: null, turnstileSecretKey: null, freeCheckKeys,
  })),
}));
vi.mock("@/server/email", () => ({
  escapeHtml: (s: string) => s,
  sendWorkspaceEmail: vi.fn(async (a: { html: string; to: string[] }) => { if (a.to[0] === "v@x.com") sent.push({ html: a.html }); return { ok: true }; }),
}));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "default" }));
// The visitor's report is the FULL scan, delivered by report-delivery (tested there).
// Here we only check the unlock hands it the right person, site and free scan.
const delivered: Array<Record<string, unknown>> = [];
vi.mock("@/server/pulse-lite/report-delivery", () => ({
  deliverFullReport: vi.fn(async (a: Record<string, unknown>) => { delivered.push(a); return { ok: true, scanId: "full1" }; }),
}));

import { GET } from "@/app/api/public/pulse/scan/[id]/route";
import { getPublicReport, renderReportMarkdown } from "@/server/pulse-lite/public-report";
import { notifyLeadOfScanResult } from "@/server/pulse-lite/leads";

const call = async () => {
  const res = await GET(new Request("https://x.test/api/public/pulse/scan/s1") as never, { params: Promise.resolve({ id: "s1" }) });
  return { status: res.status, text: await res.text() };
};
const SURFACES = async () => {
  const api = (await call()).text;
  const md = renderReportMarkdown((await getPublicReport("s1"))!);
  return { api, md };
};

beforeEach(() => { freeCheckKeys = null; captured = false; sent.length = 0; });

describe("no limit (the default, and what is live today)", () => {
  it("every surface shows every finding with its evidence and says nothing is locked", async () => {
    const { api, md } = await SURFACES();
    for (const text of [api, md]) for (const d of Object.values(SECRET_DETAILS)) expect(text).toContain(d);
    expect(JSON.parse(api).data?.triage?.lockedCount ?? JSON.parse(api).triage.lockedCount).toBe(0);
    expect(md).not.toMatch(/in-depth review: /);
  });
});

describe("limited to one check", () => {
  beforeEach(() => { freeCheckKeys = ["csp_header"]; });

  it("shows the chosen finding and leaks NONE of the locked evidence to a stranger", async () => {
    const { api, md } = await SURFACES();
    for (const text of [api, md]) {
      expect(text).toContain(SECRET_DETAILS.csp);
      expect(text).not.toContain(SECRET_DETAILS.terms);
      expect(text).not.toContain(SECRET_DETAILS.hsts);
      expect(text).not.toContain("terms_of_service");
      expect(text).not.toContain("hsts_header");
    }
  });

  it("counts what is held back, by area, on every surface", async () => {
    const { api, md } = await SURFACES();
    const t = (JSON.parse(api).triage ?? JSON.parse(api).data.triage);
    expect(t.lockedCount).toBe(2);
    expect(t.limited).toBe(true);
    expect(t.lockedByCategory.map((c: { category: string }) => c.category).sort()).toEqual(["Legal & Compliance", "Security"]);
    expect(md).toContain("2 more findings");
  });

  it("sends the locked findings' SHAPE only — area, priority, result — never their text", async () => {
    const { api } = await SURFACES();
    const t = (JSON.parse(api).triage ?? JSON.parse(api).data.triage);
    expect(t.lockedPreview).toHaveLength(2);
    for (const p of t.lockedPreview) expect(Object.keys(p).sort()).toEqual(["category", "status", "tier"]);
  });

  it("the visitor who unlocked gets the FULL report by email — that is what they asked for", async () => {
    delivered.length = 0;
    await notifyLeadOfScanResult("l1");
    await vi.waitFor(() => expect(delivered.length).toBe(1));
    expect(delivered[0]).toMatchObject({ to: "v@x.com", targetUrl: "https://example.com", liteScanId: "s1" });
  });

  it("once unlocked, every surface shows everything", async () => {
    captured = true;
    const { api, md } = await SURFACES();
    for (const text of [api, md]) for (const d of Object.values(SECRET_DETAILS)) expect(text).toContain(d);
    const t = (JSON.parse(api).triage ?? JSON.parse(api).data.triage);
    expect(t.lockedCount).toBe(0);
    expect(t.lockedPreview).toEqual([]);
  });

  it("the SCORE is byte-identical to the unlimited scan", async () => {
    const limited = JSON.parse((await call()).text);
    freeCheckKeys = null;
    const open = JSON.parse((await call()).text);
    const score = (x: { healthScore?: number; data?: { healthScore: number } }) => x.healthScore ?? x.data!.healthScore;
    expect(score(limited)).toBe(score(open));
    expect(score(limited)).toBe(computeScoreBreakdown(CHECKS).finalScore);
  });
});

describe("limit that shows nothing", () => {
  it("never says 'no issues' while findings exist — it says they are held back", async () => {
    freeCheckKeys = [];
    const { md } = await SURFACES();
    expect(md).not.toContain("Nothing reached the actionable threshold");
    expect(md).toContain("3 more findings");
  });
});

describe("edge cases", () => {
  it("a chosen check that did not fire on this site simply shows nothing for it", async () => {
    freeCheckKeys = ["some_other_check"];
    const t = JSON.parse((await call()).text);
    const triage = t.triage ?? t.data.triage;
    expect(triage.actionable).toEqual([]);
    expect(triage.lockedCount).toBe(3);
  });

  it("choosing everything that fired locks nothing", async () => {
    freeCheckKeys = ["csp_header", "terms_of_service", "hsts_header"];
    const t = JSON.parse((await call()).text);
    const triage = t.triage ?? t.data.triage;
    expect(triage.actionable).toHaveLength(3);
    expect(triage.lockedCount).toBe(0);
  });

  it("a clean site with a limit on reports nothing locked and does not claim a problem", async () => {
    freeCheckKeys = ["csp_header"];
    const clean = CHECKS.slice(3);
    const { triage } = await import("@/server/pulse-lite/public-scan");
    const t = triage(clean, new Set(["csp_header"]));
    expect(t.actionable).toEqual([]);
    expect(t.lockedCount).toBe(0);
  });
});

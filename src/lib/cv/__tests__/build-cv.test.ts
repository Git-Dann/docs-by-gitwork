import { describe, expect, it } from "vitest";
import {
  BODY_LINE_PX,
  CONTENT_BUDGET_PX,
  ENGAGEMENT_PX,
  IDENTITY_PX,
  NAME_LINE_PX,
  SECTION_PX,
  buildCvData,
  chipRows,
  clampProse,
  displayUrl,
  fitToOnePage,
  monthYear,
  periodLabel,
} from "../build-cv";
import type { CvEngagement } from "../types";

const eng = (over: Partial<CvEngagement> = {}): CvEngagement => ({
  client: "Client",
  project: "Platform",
  period: "Jan 2024 – present",
  startedAt: "2024-01-01",
  current: true,
  ...over,
});

describe("dates", () => {
  it("formats a month and year", () => {
    expect(monthYear("2025-03-01T00:00:00.000Z")).toBe("Mar 2025");
  });

  it("returns null rather than 'Invalid Date' for junk", () => {
    expect(monthYear("not a date")).toBeNull();
    expect(monthYear(null)).toBeNull();
  });

  it("marks an open placement as present", () => {
    expect(periodLabel("2025-03-01", null)).toBe("Mar 2025 – present");
  });

  it("collapses a range that starts and ends in the same month", () => {
    expect(periodLabel("2025-03-01", "2025-03-20")).toBe("Mar 2025");
  });

  it("uses an en dash, never an em dash", () => {
    // A hard copy rule of the Gitwork Document System, and a CV is exactly where
    // one slips in unnoticed.
    expect(periodLabel("2024-01-01", "2025-01-01")).not.toContain("—");
    expect(periodLabel("2024-01-01", null)).not.toContain("—");
  });
});

describe("clampProse", () => {
  it("leaves text that already fits", () => {
    expect(clampProse("Short bio.", 200)).toBe("Short bio.");
  });

  it("prefers a sentence boundary", () => {
    const out = clampProse("One sentence here. Then a second one that runs on and on.", 30);
    expect(out).toBe("One sentence here.");
  });

  it("never cuts mid-word when no sentence boundary is available", () => {
    const out = clampProse("alpha bravo charlie delta echo foxtrot", 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.replace("…", "").trim().split(" ").pop()).toBe("charlie");
  });
});

describe("displayUrl", () => {
  it("strips scheme, www and a trailing slash for print", () => {
    expect(displayUrl("https://www.alice.dev/")).toBe("alice.dev");
  });
});

describe("buildCvData", () => {
  const minimal = { name: " Sam Okafor ", primaryStack: "Go", githubHandle: "samok" };

  it("produces a usable CV from name, stack and handle alone", () => {
    const cv = buildCvData(minimal);
    expect(cv.name).toBe("Sam Okafor");
    expect(cv.role).toBe("Go");
    expect(cv.stack).toEqual(["Go"]);
    expect(cv.links).toEqual([
      { label: "GitHub", text: "github.com/samok", href: "https://github.com/samok" },
    ]);
    expect(cv.meta).toEqual([]);
    expect(cv.summary).toBe("");
    expect(cv.engagements).toEqual([]);
  });

  it("names every empty field so the operator is told why it looks sparse", () => {
    expect(buildCvData(minimal).missing).toEqual([
      "profile summary",
      "client engagements",
      "tech stack",
      "location",
      "years of experience",
      "LinkedIn or portfolio link",
    ]);
  });

  it("reports nothing missing on a full profile", () => {
    const cv = buildCvData(
      {
        name: "Alice",
        primaryStack: "React Native",
        techStacks: ["TypeScript"],
        location: "Manchester",
        yearsExperience: 8,
        bio: "A bio.",
        githubHandle: "alicef",
        linkedinUrl: "linkedin.com/in/alicef",
      },
      [{ clientName: "Wedge", startDate: "2025-01-01", endDate: null }],
    );
    expect(cv.missing).toEqual([]);
  });

  it("only claims 'Gitwork engineer' for an internal candidate", () => {
    expect(buildCvData({ ...minimal, origin: "INTERNAL" }).eyebrow).toBe("Gitwork engineer");
    // An EXTERNAL candidate is sourced, not engaged — asserting otherwise on a
    // document handed to a client is a false claim about a real person.
    expect(buildCvData({ ...minimal, origin: "EXTERNAL" }).eyebrow).toBe("Engineer");
  });

  it("de-dupes the primary stack out of techStacks, case-insensitively, primary first", () => {
    const cv = buildCvData({
      ...minimal,
      primaryStack: "React Native",
      techStacks: ["react native", "TypeScript"],
    });
    expect(cv.stack).toEqual(["React Native", "TypeScript"]);
  });

  it("sorts engagements newest first and marks open ones current", () => {
    const cv = buildCvData(minimal, [
      { clientName: "Old", startDate: "2022-01-01", endDate: "2023-01-01" },
      { clientName: "Now", startDate: "2025-01-01", endDate: null },
      { clientName: "Mid", startDate: "2024-01-01", endDate: "2025-01-01" },
    ]);
    expect(cv.engagements.map((e) => e.client)).toEqual(["Now", "Mid", "Old"]);
    expect(cv.engagements.map((e) => e.current)).toEqual([true, false, false]);
  });

  it("prefers the platform name over the project name for the sub-line", () => {
    const cv = buildCvData(minimal, [
      { clientName: "Wedge", projectName: "Phase 2", clientPlatformName: "iOS app", startDate: "2025-01-01" },
    ]);
    expect(cv.engagements[0].project).toBe("iOS app");
  });

  it("gives a bare host a scheme rather than emitting a relative link", () => {
    const cv = buildCvData({ ...minimal, linkedinUrl: "linkedin.com/in/samok" });
    expect(cv.links.find((l) => l.label === "LinkedIn")?.href).toBe(
      "https://linkedin.com/in/samok",
    );
  });

  it("drops a placement with no client name rather than printing a blank row", () => {
    const cv = buildCvData(minimal, [{ clientName: "   ", startDate: "2025-01-01" }]);
    expect(cv.engagements).toEqual([]);
  });
});

describe("fitToOnePage", () => {
  it("never cuts current engagements", () => {
    const current = Array.from({ length: 8 }, (_, i) => eng({ client: `C${i}`, current: true }));
    const out = fitToOnePage({ summary: "", engagements: current, stack: [], linkCount: 1 });
    expect(out.engagements).toHaveLength(8);
  });

  it("cuts the oldest past engagements first and says how many went", () => {
    const list = [
      eng({ client: "Now", current: true }),
      ...Array.from({ length: 20 }, (_, i) =>
        eng({ client: `Past${i}`, current: false, startedAt: `${2024 - i}-01-01` }),
      ),
    ];
    const out = fitToOnePage({ summary: "", engagements: list, stack: [], linkCount: 1 });
    expect(out.engagements.length).toBeLessThan(list.length);
    expect(out.engagements[0].client).toBe("Now");
    // The ones kept are the head of the past list, which arrives newest-first.
    expect(out.engagements[1].client).toBe("Past0");
    expect(out.omitted.some((o) => /earlier engagements?$/.test(o))).toBe(true);
  });

  it("gives the summary the space engagements do not use", () => {
    const long = "word ".repeat(400);
    const alone = fitToOnePage({ summary: long, engagements: [], stack: [], linkCount: 1 });
    // Nine CURRENT engagements, because current work is charged first and never
    // cut. Fewer than this and MAX_SUMMARY_LINES binds before the budget does, so
    // both sides come back at the 6-line ceiling and the test passes without
    // exercising anything — which is how the first version of it was written.
    const busy = fitToOnePage({
      summary: long,
      engagements: Array.from({ length: 9 }, () => eng()),
      stack: [],
      linkCount: 1,
    });
    expect(busy.summary.length).toBeGreaterThan(0);
    expect(alone.summary.length).toBeGreaterThan(busy.summary.length);
  });

  it("charges the identity block for a name that wraps", () => {
    const list = Array.from({ length: 20 }, (_, i) => eng({ client: `P${i}`, current: false }));
    const short = fitToOnePage({ summary: "", engagements: list, stack: [], linkCount: 1, nameLines: 1 });
    const wrapped = fitToOnePage({ summary: "", engagements: list, stack: [], linkCount: 1, nameLines: 3 });
    // Two extra name lines cost 2 x 47px, which is more than one 66px row.
    expect(wrapped.engagements.length).toBeLessThan(short.engagements.length);
  });

  it("keeps the whole document inside the measured page budget", () => {
    // The arithmetic the rendered page was measured against. If this drifts, the
    // CV overflows into the footer — which is what a line-based budget did.
    const out = fitToOnePage({
      summary: "word ".repeat(400),
      engagements: Array.from({ length: 30 }, (_, i) => eng({ client: `C${i}`, current: i < 2 })),
      stack: ["TypeScript", "Go", "Rust"],
      linkCount: 3,
      nameLines: 1,
    });
    const summaryLines = Math.ceil(out.summary.length / 87);
    const spend =
      IDENTITY_PX +
      (SECTION_PX + 34) + // links
      (SECTION_PX + 32) + // stack, one row
      (out.summary ? SECTION_PX + summaryLines * BODY_LINE_PX : 0) +
      (out.engagements.length ? SECTION_PX + out.engagements.length * ENGAGEMENT_PX : 0);
    expect(spend).toBeLessThanOrEqual(CONTENT_BUDGET_PX);
  });

  it("packs chips into rows by estimated width", () => {
    const rows = chipRows(Array.from({ length: 24 }, (_, i) => `Stack-${i}`));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flat()).toHaveLength(24);
  });

  it("trims chips past two rows and says so", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Framework-Number-${i}`);
    const out = fitToOnePage({ summary: "", engagements: [], stack: many, linkCount: 1 });
    expect(out.stack.length).toBeLessThan(many.length);
    expect(out.omitted.some((o) => o.includes("tech stack"))).toBe(true);
  });

  it("reports a clamped summary", () => {
    const out = fitToOnePage({ summary: "word ".repeat(400), engagements: [], stack: [], linkCount: 1 });
    expect(out.omitted).toContain("part of the profile summary");
  });

  it("reports nothing when everything fits", () => {
    const out = fitToOnePage({
      summary: "A short bio.",
      engagements: [eng()],
      stack: ["Go"],
      linkCount: 1,
    });
    expect(out.omitted).toEqual([]);
  });

  it("exports the measured constants it is calibrated against", () => {
    // These are a contract with render-cv.ts. Naming them here means a change to
    // the page's padding or type scale shows up as a failing expectation rather
    // than as a CV that quietly runs into the footer.
    expect({ CONTENT_BUDGET_PX, IDENTITY_PX, SECTION_PX, BODY_LINE_PX, ENGAGEMENT_PX, NAME_LINE_PX })
      .toEqual({
        CONTENT_BUDGET_PX: 1166,
        IDENTITY_PX: 233,
        SECTION_PX: 92,
        BODY_LINE_PX: 25,
        ENGAGEMENT_PX: 66,
        NAME_LINE_PX: 47,
      });
  });
});

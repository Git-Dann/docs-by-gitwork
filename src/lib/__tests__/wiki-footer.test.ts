/**
 * The wiki dashboard's footer: what it will state about a client's project, and
 * — as important on a page the client reads — what it will not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { footerFacts, latestWikiActivity } from "@/lib/wiki-footer";

const base = {
  pages: [] as { updatedAt: string }[],
  intakeItems: [] as { updatedAt: string }[],
  documents: { documents: [] as { addedAt: string }[] },
  standups: { today: { workDate: "2026-10-13T00:00:00.000Z", devs: [] }, history: [] },
};
type W = Parameters<typeof latestWikiActivity>[0];
const wiki = (over: object) => ({ ...base, ...over }) as unknown as W;

describe("latestWikiActivity", () => {
  it("is null for a wiki that has never had anything", () => {
    expect(latestWikiActivity(wiki({}))).toBeNull();
  });

  it("takes the newest of pages, requests, documents and pushed standups", () => {
    const w = wiki({
      pages: [{ updatedAt: "2026-10-01T10:00:00.000Z" }],
      intakeItems: [{ updatedAt: "2026-10-05T10:00:00.000Z" }],
      documents: { documents: [{ addedAt: "2026-10-03T10:00:00.000Z" }] },
      standups: {
        today: { workDate: "x", devs: [] },
        history: [
          {
            workDate: "x",
            devs: [{ amPushedAt: "2026-10-09T09:00:00.000Z", pmPushedAt: "2026-10-09T17:00:00.000Z" }],
          },
        ],
      },
    });
    expect(latestWikiActivity(w)).toBe("2026-10-09T17:00:00.000Z");
  });

  it("ignores an unparseable stamp rather than reporting it", () => {
    expect(latestWikiActivity(wiki({ pages: [{ updatedAt: "garbage" }] }))).toBeNull();
  });
});

describe("footerFacts", () => {
  const none = { lastActivity: null, lastActivityLabel: null, resources: 0, activeMonitors: 0, worstMonitor: null };

  it("omits every fact with nothing behind it — never a zero", () => {
    expect(footerFacts(none)).toEqual([]);
  });

  it("states what exists, in reading order", () => {
    const f = footerFacts({
      lastActivity: "2026-10-09T17:00:00.000Z",
      lastActivityLabel: "4 days ago",
      resources: 1,
      activeMonitors: 2,
      worstMonitor: "DOWN",
    });
    expect(f.map((x) => `${x.label}=${x.value}`)).toEqual([
      "Last updated=4 days ago",
      "Resource=1",
      "Systems=Down",
    ]);
    expect(f[2].tone).toBe("down");
  });

  it("says nothing about systems no check has run on yet", () => {
    expect(footerFacts({ ...none, activeMonitors: 3, worstMonitor: "UNKNOWN" })).toEqual([]);
  });
});

describe("the dashboard", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const DASH = strip(readFileSync(join(process.cwd(), "src/components/clients/wiki/wiki-dashboard.tsx"), "utf8"));

  it("caps every dashboard with the footer, outside the sections-only branch", () => {
    const last = DASH.lastIndexOf("<WikiFooter");
    expect(last).toBeGreaterThan(DASH.lastIndexOf("No published sections yet."));
  });

  it("never labels a milestone that has passed as 'Next'", () => {
    expect(DASH).toMatch(/milestonePassed\(milestone\.date\) \? "Last:" : "Next:"/);
  });
});

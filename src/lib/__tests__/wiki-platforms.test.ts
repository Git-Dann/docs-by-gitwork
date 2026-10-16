/**
 * Platforms in the client wiki: what is safe to link to, and which renewals are worth
 * putting on the overview.
 */
import { describe, expect, it } from "vitest";
import {
  daysUntil,
  parseRenewalDate,
  renewalPhrase,
  renewalTone,
  safePlatformUrl,
  toWikiPlatform,
  upcomingRenewals,
} from "@/lib/wiki-platforms";

const NOW = new Date("2026-10-15T18:00:00Z");
const p = (id: string, renewsOn: string | null, renewalNote: string | null = null) => ({
  id,
  name: `Platform ${id}`,
  renewsOn,
  renewalNote,
});

describe("safePlatformUrl", () => {
  it("keeps http(s) and gives a bare domain https", () => {
    expect(safePlatformUrl("https://app.client.com/x")).toBe("https://app.client.com/x");
    expect(safePlatformUrl("app.client.com")).toBe("https://app.client.com");
  });

  it("drops script and data URLs — they render as a link the client clicks", () => {
    expect(safePlatformUrl("javascript:alert(1)")).toBeNull();
    expect(safePlatformUrl("data:text/html,hi")).toBeNull();
    expect(safePlatformUrl("not a url")).toBeNull();
    expect(safePlatformUrl("")).toBeNull();
  });
});

describe("toWikiPlatform", () => {
  it("carries links and renewal, and nothing it was not given", () => {
    const out = toWikiPlatform({
      id: "1",
      name: "Web",
      platformType: " Next.js ",
      url: "web.client.com",
      stagingUrl: "javascript:x",
      repoUrl: null,
      links: [{ label: "Board", url: "https://board.example" }, { label: "Bad", url: "javascript:x" }],
      renewsOn: new Date("2026-11-01T00:00:00Z"),
      renewalNote: " Domain ",
    });
    expect(out).toEqual({
      id: "1",
      name: "Web",
      platformType: "Next.js",
      url: "https://web.client.com",
      stagingUrl: null,
      repoUrl: null,
      links: [{ label: "Board", url: "https://board.example" }],
      renewsOn: "2026-11-01T00:00:00.000Z",
      renewalNote: "Domain",
    });
  });
});

describe("renewals on the overview", () => {
  it("counts whole calendar days, ignoring the time of day", () => {
    expect(daysUntil("2026-10-15T00:00:00Z", NOW)).toBe(0);
    expect(daysUntil("2026-10-16T00:00:00Z", NOW)).toBe(1);
    expect(daysUntil("2026-10-12T00:00:00Z", NOW)).toBe(-3);
  });

  it("shows recently passed and upcoming, soonest first, up to the limit", () => {
    const out = upcomingRenewals(
      [
        p("later", "2026-12-01T00:00:00Z", "SSL"),
        p("passed", "2026-10-10T00:00:00Z", "Domain"),
        p("soon", "2026-10-20T00:00:00Z"),
        p("none", null),
      ],
      NOW,
    );
    expect(out.map((r) => r.platformId)).toEqual(["passed", "soon", "later"]);
    // A renewal with no note says which platform it is rather than going blank.
    expect(out[1].what).toBe("Platform soon");
  });

  it("leaves out dates beyond the horizon, and long-passed ones nobody updated", () => {
    const out = upcomingRenewals(
      [p("far", "2027-06-01T00:00:00Z"), p("ancient", "2026-06-01T00:00:00Z")],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("is amber inside a fortnight and red once passed", () => {
    expect(renewalTone(-1)).toBe("overdue");
    expect(renewalTone(14)).toBe("soon");
    expect(renewalTone(15)).toBe("later");
    expect(renewalPhrase(0)).toBe("today");
    expect(renewalPhrase(23)).toBe("in 23 days");
    expect(renewalPhrase(-3)).toBe("3 days ago");
  });
});

describe("parseRenewalDate", () => {
  it("takes a real date, clears on empty, refuses an impossible one", () => {
    expect(parseRenewalDate("2026-11-30")?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(parseRenewalDate("")).toBeNull();
    expect(parseRenewalDate(undefined)).toBeNull();
    // `new Date` would roll this into 3 March and store a date nobody typed.
    expect(parseRenewalDate("2026-02-31")).toBeNull();
    expect(parseRenewalDate("30/11/2026")).toBeNull();
  });
});

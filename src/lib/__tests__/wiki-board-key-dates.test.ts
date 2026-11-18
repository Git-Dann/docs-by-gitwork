/**
 * Key dates (src/lib/wiki-board-key-dates.ts) and reading them from the planning tool's feed.
 */
import { describe, expect, it } from "vitest";
import { forgeKeyDateRef, isRealDay, planKeyDateImport } from "@/lib/wiki-board-key-dates";
import { parseForgeFeed, parseForgeJson } from "@/lib/forge-import/feed";

describe("a real day", () => {
  it("is the right shape and exists", () => {
    expect(isRealDay("2026-11-20")).toBe(true);
    expect(isRealDay("2026-11-31")).toBe(false);
    expect(isRealDay("2026-2-1")).toBe(false);
    expect(isRealDay("tomorrow")).toBe(false);
  });
});

describe("importing the planning tool's dates", () => {
  const dates = [
    { id: "469", title: "Mini Major", date: "2026-06-25" },
    { id: "474", title: "Million Pound Drop", date: "2026-08-17" },
  ];

  it("creates each date once, keyed by its id", () => {
    const plan = planKeyDateImport(dates, new Set());
    expect(plan.create).toEqual([
      { externalRef: "forge-date:469", title: "Mini Major", date: "2026-06-25" },
      { externalRef: "forge-date:474", title: "Million Pound Drop", date: "2026-08-17" },
    ]);
  });

  it("a second run creates nothing", () => {
    const first = planKeyDateImport(dates, new Set());
    const second = planKeyDateImport(dates, new Set(first.create.map((c) => c.externalRef)));
    expect(second.create).toEqual([]);
    expect(second.existing).toBe(2);
  });

  it("a date deleted in Foundry isn't brought back (its ref is still known)", () => {
    const plan = planKeyDateImport(dates, new Set([forgeKeyDateRef("469")]));
    expect(plan.create.map((c) => c.title)).toEqual(["Million Pound Drop"]);
  });

  it("the same id twice in one feed is created once", () => {
    expect(planKeyDateImport([...dates, dates[0]], new Set()).create).toHaveLength(2);
  });

  it("skips a date with no title or no real date", () => {
    const plan = planKeyDateImport(
      [
        { id: "1", title: "  ", date: "2026-06-25" },
        { id: "2", title: "No date", date: null },
        { id: "3", title: "Bad date", date: "2026-02-30" },
      ],
      new Set(),
    );
    expect(plan).toMatchObject({ create: [], skipped: 3 });
  });
});

describe("reading companyDates from the feed", () => {
  it("keeps id, title and date, and survives the byte-order mark", () => {
    const raw = parseForgeJson(
      "﻿" +
        JSON.stringify({
          features: [],
          companyDates: [
            { id: 469, title: "Mini Major", date: "2026-06-25", tracked: true },
            { id: "x", title: "", date: "2026-06-25" },
            { title: "No id", date: "2026-06-25" },
            "junk",
          ],
        }),
    );
    expect(parseForgeFeed(raw).keyDates).toEqual([{ id: "469", title: "Mini Major", date: "2026-06-25" }]);
  });

  it("a feed with no companyDates has none", () => {
    expect(parseForgeFeed({ features: [] }).keyDates).toEqual([]);
  });
});

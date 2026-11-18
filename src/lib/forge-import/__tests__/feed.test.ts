import { describe, expect, it } from "vitest";
import { FEED_LIMITS, parseForgeFeed, parseForgeJson, safeHttpUrl } from "../feed";

const raw = {
  features: [
    {
      id: "247",
      type: "feature",
      name: "Achievements & Badges",
      workflowStage: "future-idea",
      category: "Gamification",
      featurePrice: "scoping",
      timeEstimate: 0,
      releaseId: null,
      dependsOn: [],
      createdDate: "2026-05-18",
      images: [],
      stageDates: { "future-idea": "2026-05-21", junk: 7 },
      links: [{ label: "Doc", url: "https://docs.google.com/x" }, { label: "Bad", url: "javascript:alert(1)" }],
    },
    { id: "", name: "No id" },
    { id: "999" },
  ],
  subitems: [{ id: "311", name: "Scramble Mode", parentFeatureId: "249", workflowStage: "live-features", images: ["data:image/png;base64,x", "https://ops.example/a.jpg"] }],
  bugs: [{ id: "348", title: "Player Rank Spacing", priority: "medium", reportedDate: "2026-05-18", linkedFeatureId: "283" }],
  feedback: "not a list",
  releases: [
    { id: "244", name: "v1.1.0 | Q2: Bag Management System (Weeks 27 -> 30)", releaseName: "Bag Management System", versionNumber: "1.1.0", startWeek: "2026-06-30", endWeek: "2026-07-21", links: [] },
    { id: "245", name: "no version" },
  ],
};

describe("reading Big Wedge's Forge feed", () => {
  it("accepts the byte-order mark the endpoint sends", () => {
    expect(parseForgeJson("﻿" + JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
  });

  it("reads every collection, skips and counts items with no id or title, tolerates a wrong shape", () => {
    const feed = parseForgeFeed(raw);
    expect(feed.items.map((i) => `${i.type}:${i.id}`)).toEqual(["feature:247", "subitem:311", "bug:348"]);
    expect(feed.skipped).toBe(2);
  });

  it("keeps only http(s) links, drops bad dates", () => {
    const f = parseForgeFeed(raw).items[0];
    expect(f.links).toEqual([{ label: "Doc", url: "https://docs.google.com/x" }]);
    expect(f.stageDates).toEqual({ "future-idea": "2026-05-21" });
    expect(parseForgeFeed(raw).items[1].images).toEqual(["https://ops.example/a.jpg"]);
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("turns a release's full name into its version and its session name", () => {
    const feed = parseForgeFeed(raw);
    expect(feed.releases).toEqual([
      { id: "244", version: "v1.1.0", name: "Q2: Bag Management System (Weeks 27 -> 30)", startDate: "2026-06-30", endDate: "2026-07-21", links: [], docUrl: null },
    ]);
  });

  it("keeps a release's doc link, preferring one labelled as a doc", () => {
    const feed = parseForgeFeed({
      releases: [
        {
          id: "9",
          versionNumber: "2.0.0",
          name: "v2.0.0 | Q4",
          links: [
            { label: "Figma", url: "https://figma.com/x" },
            { label: "Release Doc", url: "https://docs.google.com/document/d/abc" },
            { label: "Bad", url: "javascript:alert(1)" },
          ],
        },
        { id: "10", versionNumber: "2.0.1", name: "v2.0.1 | Q4", links: [{ label: "", url: "https://example.com/notes" }] },
      ],
    });
    expect(feed.releases.map((r) => r.docUrl)).toEqual(["https://docs.google.com/document/d/abc", "https://example.com/notes"]);
  });

  it("caps what the feed may hand us: a huge title is shortened and flagged, never dropped", () => {
    const long = "Leaderboard ".repeat(400);
    const feed = parseForgeFeed({
      features: [{ id: "1", name: long, workflowStage: "x".repeat(500), category: "c".repeat(500) }],
      releases: [{ id: "r", versionNumber: "9".repeat(80), name: `v9 | ${"n".repeat(400)}` }],
    });
    const [i] = feed.items;
    expect(i.title.length).toBeLessThanOrEqual(FEED_LIMITS.title);
    expect(i.truncated).toBe(true);
    expect(i.stage.length).toBeLessThanOrEqual(FEED_LIMITS.stage);
    expect(i.category!.length).toBeLessThanOrEqual(FEED_LIMITS.category);
    // Capped at the release's own column lengths, so the value stored is the value read.
    expect(feed.releases[0].version.length).toBeLessThanOrEqual(FEED_LIMITS.version);
    expect(feed.releases[0].name!.length).toBeLessThanOrEqual(FEED_LIMITS.releaseName);
    expect(parseForgeFeed({ features: [{ id: "2", name: "Short" }] }).items[0].truncated).toBe(false);
  });

  it("returns an empty feed for nonsense rather than throwing", () => {
    expect(parseForgeFeed(null)).toEqual({ items: [], releases: [], skipped: 0 });
    expect(parseForgeFeed([1, 2])).toEqual({ items: [], releases: [], skipped: 0 });
  });
});

/**
 * Plan-first task entry. Every fixture is a verbatim title from the live boards (October
 * 2026): the planned tasks that sat untouched, and the same-day tasks developers logged
 * instead. A matcher tuned on invented titles would pass these tests and fail the team.
 */
import { describe, expect, it } from "vitest";
import {
  matchPlannedTasks,
  rankPlanQueue,
  stem,
  suggestCategory,
  terms,
} from "../plan-match";

const planned = (title: string, categoryName: string | null = "New Work", id = title) => ({ id, title, categoryName });

// Fellas Loaded's open, planned tasks (a slice).
const FELLAS_PLAN = [
  planned("MP3 audio downloads for videos"),
  planned('Add download options in-app, likely "Download Video" and "Download MP3"'),
  planned("Review gift subscription journey from purchase to email to redemption"),
  planned("Live streaming deprioritised"),
  planned("Payments: Web trials with auto-convert (Stripe)", "Build"),
  planned("Backend: Add trial state model", "Build"),
  planned("Event tracking", "Backlog"),
  planned("Fix Home Navigation Not Directly Selectable", "Firestick"),
  planned("Add MP3 upload option in admin"),
  planned("Review Item: General Feedback and Updates", "QA"),
];

describe("terms", () => {
  it("keeps the words that say WHICH work it is, and drops the ones that don't", () => {
    expect(terms("Fix audio download issues related to thumbnails and available images")).toEqual(
      expect.arrayContaining(["audio", "download", "thumbnail", "image"]),
    );
    expect(terms("Fix audio download issues")).not.toContain("fix");
    expect(terms("Fix audio download issues")).not.toContain("issue");
  });

  it("stems plurals and -ing so the same word meets itself", () => {
    expect(stem("downloads")).toBe("download");
    expect(stem("downloading")).toBe("download");
    expect(stem("subscriptions")).toBe("subscription");
    expect(stem("verified")).toBe(stem("verify"));
  });
});

describe("matchPlannedTasks — finds the planned task the logged work belongs to", () => {
  it("⚠️ twenty logged audio-download tasks all point back to the one planned task", () => {
    for (const logged of [
      "Add download progress indicators for audio and video files",
      "Implement logic to download one video quality and one audio file per video",
      "Test audio and video download flow",
      "Continue work on audio download feature for Flutter app",
      "Complete development testing for all download flows, including audio and video downloads",
    ]) {
      const [top] = matchPlannedTasks(logged, FELLAS_PLAN);
      expect(top?.item.title, logged).toBe("MP3 audio downloads for videos");
    }
  });

  it("returns the matched words, as written in the planned title, for highlighting", () => {
    const [top] = matchPlannedTasks("Test audio and video download flow", FELLAS_PLAN);
    expect(top.matchedWords).toEqual(expect.arrayContaining(["audio", "downloads", "videos"]));
  });

  it("⚠️ one generic shared word out of many is not a match", () => {
    // "feedback", "navigation", "tracking" are each in a planned title — and these are
    // all about something else.
    expect(matchPlannedTasks("Address QA feedback on staging build.", FELLAS_PLAN)).toEqual([]);
    expect(
      matchPlannedTasks(
        "Fix Sign Up and Sign In navigation so users are navigated to the Feed View TabBar",
        FELLAS_PLAN,
      ),
    ).toEqual([]);
    expect(matchPlannedTasks("Implemented offline video progress tracking to save playback", FELLAS_PLAN)).toEqual([]);
  });

  it("a typo isn't a match on its own — 'Streaks' is not 'streaming'", () => {
    expect(matchPlannedTasks("Test new Streaks options and verify functionality", FELLAS_PLAN)).toEqual([]);
  });

  it("a platform tag can't carry a match: '- IOS' is not 'iOS subscription setup'", () => {
    expect(
      matchPlannedTasks("Added peer round verification - IOS", [planned("iOS subscription setup")]),
    ).toEqual([]);
  });

  it("⚠️ platform tags alone never make two tasks the same, even when both match", () => {
    // Two shared words, so the two-word rule is satisfied — only the platform rule stops it.
    expect(matchPlannedTasks("Settings screen - iOS Android", [planned("iOS Android release")])).toEqual([]);
  });

  it("⚠️ a match resting on one word has to be a strong one", () => {
    // Real Wedge pair: "club" is the only shared word, and these are different work.
    const wedge = [planned("Club Tracking & Bag Management"), planned("Handicap (Filter)"), planned("Wedge Verified Courses")];
    expect(matchPlannedTasks("Add new club brands", wedge)).toEqual([]);
  });

  it("the client's own name is ignored when passed", () => {
    const wedge = [planned("Wedge Verified Courses")];
    expect(
      matchPlannedTasks("UI tweaks on wedge android app and uploaded latest staging build", wedge, {
        ignoreWords: "Wedge",
      }),
    ).toEqual([]);
  });

  it("a short draft can still match a short planned task strongly", () => {
    const [top] = matchPlannedTasks("Q/A feedback", [planned("Review Item: General Feedback and Updates")]);
    expect(top?.item.title).toBe("Review Item: General Feedback and Updates");
  });

  it("identical planned titles are one suggestion, not three", () => {
    const dupes = [1, 2, 3].map((i) => planned("Review Item: General Feedback and Updates", "QA", `d${i}`));
    expect(matchPlannedTasks("Q/A feedback", dupes)).toHaveLength(1);
  });

  it("nothing to match on → nothing returned", () => {
    expect(matchPlannedTasks("Fix the issue", FELLAS_PLAN)).toEqual([]);
    expect(matchPlannedTasks("", FELLAS_PLAN)).toEqual([]);
  });
});

describe("suggestCategory — which category a new task belongs in", () => {
  const WEDGE_CATS = [
    { id: "premium", name: "Premium Feature Timeline" },
    { id: "free", name: "Free Feature Timeline" },
    { id: "qa", name: "QA" },
  ];
  const WEDGE_TASKS = [
    { title: "Deploy the latest build to staging.", categoryId: "free" },
    { title: "Deployed new build in Preprod.", categoryId: "free" },
    { title: "Handicap Tracking & Auto Calculation", categoryId: "premium" },
    { title: "Create Groups and add support to rounds.", categoryId: "premium" },
    { title: "Metric Label missing on Leaderboard", categoryId: "qa" },
  ];

  it("by the category's own name", () => {
    expect(suggestCategory("Address QA feedback on staging build.", WEDGE_CATS, WEDGE_TASKS)?.categoryId).toBe("qa");
  });

  it("by the tasks already in it", () => {
    const s = suggestCategory("Deploy the latest build to preprod.", WEDGE_CATS, WEDGE_TASKS);
    expect(s?.categoryId).toBe("free");
    expect(s?.reason).toMatch(/^Similar to “Deploy/);
    expect(suggestCategory("Update Handicap calculation toggle.", WEDGE_CATS, WEDGE_TASKS)?.categoryId).toBe("premium");
  });

  it("⚠️ never by a prefix of the name — 'Back button' is not 'Backlog'", () => {
    const cats = [{ id: "backlog", name: "Backlog" }, { id: "build", name: "Build" }];
    expect(
      suggestCategory("Updated Video Player retry/error screen with a Back button", cats, []),
    ).toBeNull();
  });

  it("a category's topic has to match, not just its platform word", () => {
    const cats = [{ id: "an", name: "Analytics dashboard" }, { id: "found", name: "Foundations & auth" }];
    expect(suggestCategory("Dark-mode audit across dashboard", cats, [])).toBeNull();
    expect(suggestCategory("Analytics dashboard loading skeletons", cats, [])?.categoryId).toBe("an");
  });

  it("a category named for a platform still matches on it", () => {
    const cats = [{ id: "be", name: "Backend" }, { id: "fe", name: "Frontend" }];
    expect(suggestCategory("Backend rate limiting for invites", cats, [])?.categoryId).toBe("be");
  });

  it("asks rather than guesses when nothing is a clear winner", () => {
    expect(suggestCategory("Diagnose and fix notification duplication issue.", WEDGE_CATS, WEDGE_TASKS)).toBeNull();
  });
});

describe("rankPlanQueue", () => {
  const t = (id: string, priority: string, dueDate: string | null, status = "TODO", orderKey = 0) => ({
    id,
    priority,
    dueDate,
    status,
    orderKey,
  });

  it("priority first, then the earliest due date, undated last, then To do before Backlog", () => {
    const ranked = rankPlanQueue([
      t("low", "LOW", "2026-10-01"),
      t("undated", "HIGH", null),
      t("soon", "HIGH", "2026-10-20"),
      t("sooner", "HIGH", "2026-10-18"),
      t("backlog", "MEDIUM", null, "BACKLOG"),
      t("todo", "MEDIUM", null, "TODO"),
    ]).map((x) => x.id);
    expect(ranked).toEqual(["sooner", "soon", "undated", "todo", "backlog", "low"]);
  });
});

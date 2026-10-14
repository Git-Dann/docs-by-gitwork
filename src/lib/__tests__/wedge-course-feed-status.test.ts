/**
 * The Big Wedge feed's state, and the dedupe rule that decides what is a new request.
 *
 * The two failures this guards against are the two that kept recurring: a broken feed
 * that reads as "nothing new" on the page, and a genuine golfer's request thrown away as a
 * "duplicate" because someone else once asked for the same course.
 */
import { describe, expect, it } from "vitest";
import {
  FEED_BACKFILL_FROM,
  describeFeedHealth,
  feedSince,
  isDuplicateFeedRow,
  nextFeedStatus,
  parseFeedStatus,
  type CourseFeedStatus,
} from "../wedge-course-feed-status";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const healthy: CourseFeedStatus = {
  lastRunAt: "2026-10-14T11:15:00.000Z",
  lastSuccessAt: "2026-10-14T11:15:00.000Z",
  failingSince: null,
  lastError: null,
  lastCreated: 3,
  lastStatusSyncAt: "2026-10-14T01:15:00.000Z",
  alertedDownAt: null,
};

describe("where the next pull starts", () => {
  it("backfills from the outage on the first ever run", () => {
    expect(feedSince(null)).toBe(FEED_BACKFILL_FROM);
  });
  it("overlaps the last success by two days — overlap is free, rows dedupe by reference", () => {
    expect(feedSince(healthy)).toBe("2026-10-12");
  });
  it("never reaches back before the backfill date", () => {
    expect(feedSince({ ...healthy, lastSuccessAt: "2026-07-26T00:00:00.000Z" })).toBe(FEED_BACKFILL_FROM);
  });
});

describe("the status after a run", () => {
  it("a failure keeps the last success, so the next run re-reads the missed window", () => {
    const next = nextFeedStatus(healthy, { ok: false, error: "HTTP 401" }, NOW);
    expect(next.lastSuccessAt).toBe(healthy.lastSuccessAt);
    expect(feedSince(next)).toBe(feedSince(healthy));
  });
  it("records when the outage began, and keeps that date across later failures", () => {
    const first = nextFeedStatus(healthy, { ok: false, error: "a" }, NOW);
    expect(first.failingSince).toBe(NOW.toISOString());
    const later = nextFeedStatus(first, { ok: false, error: "b" }, new Date("2026-10-14T13:00:00.000Z"));
    expect(later.failingSince).toBe(NOW.toISOString());
    expect(later.lastError).toBe("b");
  });
  it("a success clears the outage", () => {
    const failing = nextFeedStatus(healthy, { ok: false, error: "a" }, NOW);
    const ok = nextFeedStatus(failing, { ok: true, created: 0 }, NOW);
    expect(ok.failingSince).toBeNull();
    expect(ok.lastError).toBeNull();
    expect(ok.lastStatusSyncAt).toBe(healthy.lastStatusSyncAt);
  });
});

describe("what the page says", () => {
  it("healthy is a quiet readout with the count", () => {
    const h = describeFeedHealth(healthy, NOW);
    expect(h.state).toBe("healthy");
    expect(h.message).toBe("Pulled from the Big Wedge app 45 min ago · 3 new.");
  });
  it("an errored run is failing, and names the error", () => {
    const h = describeFeedHealth(nextFeedStatus(healthy, { ok: false, error: "HTTP 401" }, NOW), NOW);
    expect(h.state).toBe("failing");
    expect(h.message).toContain("HTTP 401");
  });
  it("⚠️ a feed that silently stopped running is failing too — a missing cron line errors nowhere", () => {
    const h = describeFeedHealth(healthy, new Date("2026-10-14T18:00:00.000Z"));
    expect(h.state).toBe("failing");
  });
  it("never having run is not reported as healthy", () => {
    expect(describeFeedHealth(null, NOW).state).toBe("never-run");
  });
  it("garbage in the column reads as never-run, not as a crash", () => {
    expect(parseFeedStatus("nope")).toBeNull();
    expect(describeFeedHealth(parseFeedStatus({ lastCreated: "x" }), NOW).state).toBe("never-run");
  });
});

describe("what counts as a duplicate", () => {
  const seen = {
    refs: new Set(["bigwedge:r1:0"]),
    namesFromOtherSources: new Set(["allen park golf centre"]),
  };

  it("the same Big Wedge request is always a duplicate", () => {
    expect(
      isDuplicateFeedRow({ externalRef: "bigwedge:r1:0", courseName: "Anything", submittedAt: "2026-10-01T00:00:00Z" }, seen),
    ).toBe(true);
  });
  it("⚠️ a SECOND golfer asking for a course already on the board is a new request, not a duplicate", () => {
    expect(
      isDuplicateFeedRow(
        { externalRef: "bigwedge:r9:0", courseName: "Allen Park Golf Centre", submittedAt: "2026-10-01T00:00:00Z" },
        seen,
      ),
    ).toBe(false);
  });
  it("before the email feed died, a matching name was probably that email — so skip it", () => {
    expect(
      isDuplicateFeedRow(
        { externalRef: "bigwedge:r8:0", courseName: " Allen Park Golf Centre ", submittedAt: "2026-08-01T00:00:00Z" },
        seen,
      ),
    ).toBe(true);
  });
});

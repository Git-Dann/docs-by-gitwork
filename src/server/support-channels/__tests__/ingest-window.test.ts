/**
 * "Never read mail from before this date."
 *
 * Connecting a mailbox pulled whatever the adapter's rolling `lookbackDays` reached — 30 days by
 * default — so Fellas' Care queue was 324 conversations deep on the day it was connected, most of
 * it Reddit chatter and cold outreach, and nobody has ever cleared it.
 */
import { describe, expect, it } from "vitest";
import { dropsBeforeFloor, floorDate, floorSeconds } from "@/server/support-channels/ingest-window";
import { resolveScanWindows } from "@/server/support-channels/imap";

const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-11-20T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("the floor", () => {
  it("wins when it is later than the rolling window", () => {
    expect(floorDate(days(30), days(7))).toEqual(days(7));
  });

  it("does NOT widen a window that is already inside it", () => {
    // A floor is a floor, not a window: it must never make a sync read MORE than it would have.
    expect(floorDate(days(2), days(7))).toEqual(days(2));
  });

  it("is a no-op when unset, so every existing connector behaves exactly as before", () => {
    expect(floorDate(days(30), null)).toEqual(days(30));
    expect(floorDate(days(30), undefined)).toEqual(days(30));
    const secs = Math.floor(days(30).getTime() / 1000);
    expect(floorSeconds(secs, null)).toBe(secs);
  });

  it("clamps epoch seconds the same way", () => {
    expect(floorSeconds(Math.floor(days(30).getTime() / 1000), days(7)))
      .toBe(Math.floor(days(7).getTime() / 1000));
    expect(floorSeconds(Math.floor(days(2).getTime() / 1000), days(7)))
      .toBe(Math.floor(days(2).getTime() / 1000));
  });
});

describe("resolveScanWindows", () => {
  const cfg = { lookbackDays: 30, sentBackfillDays: undefined };

  it("⚠️ clamps when lastSyncedAt is null — the Re-sync history shape", () => {
    /*
     * This is the single test that matters most in this file, and the single edit that silently
     * undoes the whole reset.
     *
     * "Re-sync history" nulls `lastSyncedAt` on purpose, which drops `inboxSince` to
     * `now − lookbackDays` — 30 days. Without the floor, one press of that button pulls the
     * backlog straight back in, the queue is 300 deep again, and it looks as though none of this
     * work ever happened. An operator reaching for that button is, by definition, someone trying
     * to FIX a board that looks wrong.
     */
    const { inboxSince } = resolveScanWindows(cfg, null, NOW, null, days(7));
    expect(inboxSince).toEqual(days(7));
    expect(inboxSince.getTime()).toBeGreaterThan(days(30).getTime());
  });

  it("clamps the incremental window too", () => {
    const { inboxSince } = resolveScanWindows(cfg, days(30), NOW, null, days(7));
    expect(inboxSince).toEqual(days(7));
  });

  it("does not widen an incremental window that is already inside the floor", () => {
    // Synced yesterday: the 2-day overlap is well inside a 7-day floor and must be left alone.
    const { inboxSince } = resolveScanWindows(cfg, days(1), NOW, null, days(7));
    expect(inboxSince).toEqual(days(3));
  });

  it("⚠️ clamps the unanswered-thread widening", () => {
    /*
     * The Sent read widens to the oldest thread still believed unanswered, so it can answer "was
     * this actually replied to?" (§42.5). Left unclamped it reaches back past the start date and
     * re-creates the history the floor exists to leave behind.
     */
    const { sentSince } = resolveScanWindows(cfg, days(1), NOW, days(120), days(7));
    expect(sentSince).toEqual(days(7));
  });

  it("clamps an explicit sent backfill", () => {
    const { sentSince } = resolveScanWindows({ ...cfg, sentBackfillDays: 90 }, days(1), NOW, null, days(7));
    expect(sentSince).toEqual(days(7));
  });

  it("with no floor, reproduces today's behaviour exactly", () => {
    // The two-sided half: every existing connector has no floor and must not move.
    const before = resolveScanWindows(cfg, null, NOW, days(120));
    const after = resolveScanWindows(cfg, null, NOW, days(120), null);
    expect(after).toEqual(before);
    expect(before.inboxSince).toEqual(days(30));
    // Widened to reach the oldest unanswered thread, which is inside the 180-day cap.
    expect(before.sentSince).toEqual(days(120));
  });

  it("the 180-day cap still bounds a connector with no floor", () => {
    // Every existing connector has no floor, so removing SENT_AUTO_BACKFILL_MAX_DAYS would
    // un-cap them all — one ancient unanswered thread turning every run into a years-long search.
    const { sentSince } = resolveScanWindows(cfg, days(1), NOW, days(400));
    expect(sentSince).toEqual(days(180));
  });
});

describe("the ingest backstop", () => {
  const msg = (at: Date) => ({ createdAt: at });

  it("drops a NEW conversation whose every message predates the floor", () => {
    expect(dropsBeforeFloor({ messages: [msg(days(40)), msg(days(35))] }, days(7), true)).toBe(true);
  });

  it("⚠️ keeps a thread that started before the floor but has a message after it", () => {
    /*
     * The rule is "every message is older", never "the thread started earlier" — and `receivedAt`
     * is stamped once at creation and never updated (§42.1), so it cannot be the test. A thread
     * opened in January that got a customer message this morning is a live customer waiting on a
     * reply; dropping it would be the exact failure this work exists to remove.
     */
    expect(dropsBeforeFloor({ messages: [msg(days(40)), msg(days(1))] }, days(7), true)).toBe(false);
  });

  it("never touches a conversation we already have", () => {
    expect(dropsBeforeFloor({ messages: [msg(days(40))] }, days(7), false)).toBe(false);
  });

  it("keeps anything it cannot date — we could not look, not it is old", () => {
    expect(dropsBeforeFloor({ messages: [] }, days(7), true)).toBe(false);
    expect(dropsBeforeFloor({ messages: [{ createdAt: null }] }, days(7), true)).toBe(false);
    expect(dropsBeforeFloor({}, days(7), true)).toBe(false);
  });

  it("does nothing with no floor set", () => {
    expect(dropsBeforeFloor({ messages: [msg(days(900))] }, null, true)).toBe(false);
  });
});

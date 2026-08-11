import { describe, expect, it } from "vitest";
import { resolveScanWindows } from "@/server/support-channels/imap";

/**
 * The IMAP SINCE floors decide what the sync is even capable of seeing. Getting them wrong is
 * SILENT — the run succeeds, reports no errors, ingests nothing, and the queue stays wrong.
 *
 * The case that matters: reading the Sent folder exists so a reply typed in Gmail marks the
 * thread Replied. On a mailbox that has been syncing all along, the incremental window is
 * `lastSyncedAt − 2 days`, so Sent could only ever be read two days back — while the replies
 * that left 226 Fellas threads stuck as "awaiting" were weeks old. The feature was built and
 * still could not fix the thing it was built for.
 */

const NOW = new Date("2026-08-11T12:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

describe("resolveScanWindows", () => {
  it("first sync reaches back the default 30 days on both mailboxes", () => {
    const { inboxSince, sentSince } = resolveScanWindows({}, null, NOW);
    expect(days(NOW, inboxSince)).toBe(30);
    expect(days(NOW, sentSince)).toBe(30);
  });

  it("honours lookbackDays on a first sync — this is what 'Re-sync history' rides", () => {
    const { inboxSince, sentSince } = resolveScanWindows({ lookbackDays: 90 }, null, NOW);
    expect(days(NOW, inboxSince)).toBe(90);
    expect(days(NOW, sentSince)).toBe(90);
  });

  it("steady state is incremental with a 2-day overlap (SINCE is day-granular)", () => {
    const lastSynced = new Date(NOW.getTime() - 1 * DAY);
    const { inboxSince, sentSince } = resolveScanWindows({}, lastSynced, NOW);
    expect(days(NOW, inboxSince)).toBe(3); // 1 day since sync + 2 days overlap
    expect(sentSince).toEqual(inboxSince); // Sent rides the same cheap window by default
  });

  it("sentBackfillDays reaches PAST lastSyncedAt — the deep catch-up", () => {
    // A mailbox synced an hour ago: the incremental window sees ~2 days. Without an override the
    // Sent read cannot reach a reply sent 6 weeks ago, so the thread stays wrongly "awaiting".
    const lastSynced = new Date(NOW.getTime() - 1 * 3600 * 1000);
    const { inboxSince, sentSince } = resolveScanWindows({ sentBackfillDays: 90 }, lastSynced, NOW);

    expect(days(NOW, inboxSince)).toBe(2); // inbox stays cheap — unchanged
    expect(days(NOW, sentSince)).toBe(90); // Sent goes deep
    expect(sentSince.getTime()).toBeLessThan(lastSynced.getTime());
  });

  it("ignores nonsense values rather than scanning from the epoch", () => {
    expect(days(NOW, resolveScanWindows({ lookbackDays: 0 }, null, NOW).inboxSince)).toBe(30);
    expect(days(NOW, resolveScanWindows({ lookbackDays: -5 }, null, NOW).inboxSince)).toBe(30);
    // A zero/negative backfill means "not set", so Sent falls back to the incremental window.
    const lastSynced = new Date(NOW.getTime() - 1 * DAY);
    const { inboxSince, sentSince } = resolveScanWindows({ sentBackfillDays: 0 }, lastSynced, NOW);
    expect(sentSince).toEqual(inboxSince);
  });
});

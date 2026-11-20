/**
 * "Never read mail from before this date."
 *
 * ── Why ──────────────────────────────────────────────────────────────────────────────────────
 * Connecting a mailbox pulled whatever the adapter's rolling `lookbackDays` reached — 30 days by
 * default — so Fellas' Care queue was 324 conversations deep on the day it was connected, most of
 * them Reddit chatter and cold outreach, and nobody has ever cleared it. Dan's instruction was to
 * start it again from seven days ago, and to make connecting any FUTURE client start clean.
 *
 * A floor, not a window. `lookbackDays` is rolling (now − N) and `ingestFrom` is absolute; the
 * window start is the LATER of the two. That matters: a plain 7-day rolling window would silently
 * skip a week of mail any time the sync did not run for a week, and `support-sync` runs twice a
 * day, so a box that was down over a holiday would lose real customers. With a floor, the
 * incremental window still reaches back to the last successful sync.
 *
 * ⚠️ **The clamp has to survive `lastSyncedAt` being null.** "Re-sync history" nulls it
 * deliberately, which drops IMAP's `inboxSince` to `now − lookbackDays`. Without the floor, one
 * press of that button pulls the whole backlog straight back in and undoes the reset — which is
 * the single thing most likely to make this work look like it never happened. There is a test
 * named for exactly that case.
 *
 * Pure, so the windows can be reasoned about without a mailbox. Getting one wrong is silent: the
 * sync succeeds, reports no errors, and simply never sees the mail it was meant to read.
 */

/** The later of a computed window start and the connector's floor. */
export function floorDate(computed: Date, ingestFrom: Date | null | undefined): Date {
  if (!ingestFrom) return computed;
  return ingestFrom > computed ? ingestFrom : computed;
}

/** The same, for the adapters that speak in epoch seconds (Gmail's `after:`, `lookbackSeconds`). */
export function floorSeconds(computedSeconds: number, ingestFrom: Date | null | undefined): number {
  if (!ingestFrom) return computedSeconds;
  const floor = Math.floor(ingestFrom.getTime() / 1000);
  return Math.max(computedSeconds, floor);
}

/**
 * Should a NEW conversation be dropped because everything in it predates the floor?
 *
 * The backstop behind the per-adapter clamps, applied once in `runChannelSync`, so an adapter
 * that forgets — or a future one that never knew — still cannot reintroduce old mail.
 *
 * ⚠️ Two rules, and the second is the one that is easy to get wrong:
 *
 *  - It only applies to a conversation we do not already have. An EXISTING thread always accepts
 *    new messages, however old it started.
 *  - It is "every message is older", never "the thread started earlier". A thread opened in
 *    January that got a new customer message this morning is a live customer waiting on a reply;
 *    dropping it would be the exact failure this whole piece of work exists to remove. And
 *    `receivedAt` is stamped once at creation and never updated (§42.1), so it cannot be the test.
 */
export function dropsBeforeFloor(
  item: { messages?: Array<{ createdAt?: Date | string | null }> },
  ingestFrom: Date | null | undefined,
  isNew: boolean,
): boolean {
  if (!ingestFrom || !isNew) return false;
  const stamps = (item.messages ?? [])
    .map((m) => (m.createdAt ? new Date(m.createdAt) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  // No readable timestamp at all is "we cannot tell", not "it is old" — keep it (§35).
  if (stamps.length === 0) return false;
  return stamps.every((d) => d < ingestFrom);
}

/**
 * Clearing a backlog: the rules, with no database in them.
 *
 * ── Why this is a control and not a script ───────────────────────────────────────────────────
 * Care read 573 awaiting across two clients, every row still `status: new` and `unread: true`,
 * stretching back six months. Dan's instruction was to reset the numbers and start Fellas again
 * from seven days ago. A one-off `UPDATE` on the box would have done it — and the same problem
 * returns the next time a mailbox with history is connected, which is every time. So it is a
 * control someone can reach for, and this module is the part of it that can be reasoned about.
 *
 * Nothing is deleted. The conversations stay — thread, messages, notes, audit trail — and simply
 * leave every open queue, because every queue reads `status in (NEW, OPEN)`. A customer who
 * writes again lands back in the queue on the next sync.
 */

/**
 * Nothing newer than this may be closed in bulk.
 *
 * The guard that stops "close everything older than 0 minutes" from wiping a live desk. A bulk
 * close is reversible, but reversing 500 rows is not something anyone should need to do because
 * a date picker defaulted somewhere unhelpful.
 */
export const MIN_RESET_AGE_HOURS = 24;

/** Offered on the dialog. Longer than a year is a hand-typed date, not a button. */
export const RESET_PRESET_DAYS = [7, 30, 90] as const;

/** How far back a cutoff may reach. Past this it is almost certainly a typo in a year. */
export const MAX_RESET_AGE_DAYS = 5 * 365;

export type ResetCutoff =
  | { ok: true; cutoff: Date }
  | { ok: false; reason: string };

/**
 * Turn what the dialog collected into a cutoff, or say plainly why not.
 *
 * Refusals are sentences rather than codes because they are shown to the person who typed the
 * date, and "Invalid input" on a destructive-looking control is how someone ends up pressing it
 * again harder.
 */
export function resolveResetCutoff(
  input: { presetDays?: number; iso?: string },
  now: Date = new Date(),
): ResetCutoff {
  let cutoff: Date;
  if (typeof input.presetDays === "number") {
    if (!Number.isFinite(input.presetDays) || input.presetDays <= 0) {
      return { ok: false, reason: "Choose how far back to close from." };
    }
    cutoff = new Date(now.getTime() - input.presetDays * 24 * 3600 * 1000);
  } else if (input.iso) {
    cutoff = new Date(input.iso);
    if (Number.isNaN(cutoff.getTime())) return { ok: false, reason: "That is not a date we can read." };
  } else {
    return { ok: false, reason: "Choose how far back to close from." };
  }

  if (cutoff.getTime() > now.getTime()) {
    return { ok: false, reason: "That date is in the future." };
  }
  const ageHours = (now.getTime() - cutoff.getTime()) / 3600_000;
  if (ageHours < MIN_RESET_AGE_HOURS) {
    return {
      ok: false,
      reason: `Pick a date at least ${MIN_RESET_AGE_HOURS} hours ago, so today's conversations are never closed in bulk.`,
    };
  }
  if (ageHours > MAX_RESET_AGE_DAYS * 24) {
    return { ok: false, reason: "That date is more than five years ago — check the year." };
  }
  return { ok: true, cutoff };
}

/**
 * What the dialog says before anything is written.
 *
 * Says the number and what it does NOT do, because the control reads destructive and is not: the
 * commonest reason someone does not clear a backlog they should clear is not knowing whether it
 * throws anything away.
 */
export function describeResetPlan(count: number, cutoff: Date, locale = "en-GB"): string {
  const when = cutoff.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  if (count === 0) return `Nothing here is older than ${when}. There is nothing to close.`;
  const n = count === 1 ? "1 conversation" : `${count} conversations`;
  return (
    `Close ${n} whose last message is older than ${when}. ` +
    `They stay in Care — thread, history and notes are kept — and come back if a customer writes again. You can undo this.`
  );
}

/** The marker written onto every row one run closes, so that run alone can be undone. */
export function resetBatchMarker(auditLogId: string): string {
  return `reset:${auditLogId}`;
}

export function isResetBatch(closedReason: string | null | undefined, auditLogId: string): boolean {
  return closedReason === resetBatchMarker(auditLogId);
}

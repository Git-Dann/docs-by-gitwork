/**
 * The Big Wedge course-request feed's state, and how to read it.
 *
 * Pure and framework-free: the scheduled runner (src/server/wedge-course-feed.ts) writes
 * it, and the Course Requests page reads it. One set of rules, so the page can never
 * claim the feed is healthy while the runner knows it is not.
 *
 * ⚠️ The point of this file is that a broken feed is LOUD. For two months a dead feed
 * looked exactly like "no golfer asked for a course", and the client had to tell us.
 */

export interface CourseFeedStatus {
  lastRunAt: string | null;
  /** The last run that fetched from Big Wedge without an error. */
  lastSuccessAt: string | null;
  /** First failure in the current unbroken run of failures. Null while healthy. */
  failingSince: string | null;
  lastError: string | null;
  /** Requests created by the last successful run. */
  lastCreated: number;
  /** Last time the action_taken → ADDED status pass ran. */
  lastStatusSyncAt: string | null;
  /** When the "feed is down" message was posted to the client's Slack channel. Null once
   *  the recovery message has gone out, or if no outage has been announced. */
  alertedDownAt: string | null;
}

/** Where the feed was down before this fix existed — the first run backfills from here. */
export const FEED_BACKFILL_FROM = "2026-07-25";

/** A healthy feed runs hourly; this long without a success means it is not healthy. */
export const FEED_STALE_HOURS = 6;

const DAY_MS = 86_400_000;

export function parseFeedStatus(value: unknown): CourseFeedStatus | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  return {
    lastRunAt: str("lastRunAt"),
    lastSuccessAt: str("lastSuccessAt"),
    failingSince: str("failingSince"),
    lastError: str("lastError"),
    lastCreated: typeof v.lastCreated === "number" ? v.lastCreated : 0,
    lastStatusSyncAt: str("lastStatusSyncAt"),
    alertedDownAt: str("alertedDownAt"),
  };
}

/**
 * The `since` date (YYYY-MM-DD) for the next pull: two days before the last success —
 * the API's dates are day-granular in practice and an overlap is free, because rows are
 * de-duplicated — or the backfill date when there has never been one.
 */
export function feedSince(prev: CourseFeedStatus | null): string {
  if (!prev?.lastSuccessAt) return FEED_BACKFILL_FROM;
  const since = new Date(new Date(prev.lastSuccessAt).getTime() - 2 * DAY_MS);
  const floor = new Date(`${FEED_BACKFILL_FROM}T00:00:00Z`);
  return (since < floor ? floor : since).toISOString().slice(0, 10);
}

/** The status after a run. A failure keeps the last success, so the next pull backfills. */
export function nextFeedStatus(
  prev: CourseFeedStatus | null,
  outcome: { ok: true; created: number } | { ok: false; error: string },
  now: Date,
): CourseFeedStatus {
  const at = now.toISOString();
  if (outcome.ok) {
    return {
      lastRunAt: at,
      lastSuccessAt: at,
      failingSince: null,
      lastError: null,
      lastCreated: outcome.created,
      lastStatusSyncAt: prev?.lastStatusSyncAt ?? null,
      alertedDownAt: prev?.alertedDownAt ?? null,
    };
  }
  return {
    lastRunAt: at,
    lastSuccessAt: prev?.lastSuccessAt ?? null,
    failingSince: prev?.failingSince ?? at,
    lastError: outcome.error,
    lastCreated: prev?.lastCreated ?? 0,
    lastStatusSyncAt: prev?.lastStatusSyncAt ?? null,
    alertedDownAt: prev?.alertedDownAt ?? null,
  };
}

export type FeedHealth =
  | { state: "healthy"; message: string }
  | { state: "failing"; message: string }
  | { state: "never-run"; message: string };

/**
 * What the Course Requests page should say. "Failing" whenever the last run errored OR
 * the last success is older than FEED_STALE_HOURS — a feed that silently stopped
 * running (a missing cron line) is as broken as one that errors.
 */
export function describeFeedHealth(status: CourseFeedStatus | null, now: Date): FeedHealth {
  if (!status?.lastRunAt) {
    return {
      state: "never-run",
      message: "The Big Wedge app feed has not run yet — new course requests will not arrive until it does.",
    };
  }
  const lastOk = status.lastSuccessAt ? new Date(status.lastSuccessAt) : null;
  const staleMs = FEED_STALE_HOURS * 3_600_000;
  if (status.failingSince || !lastOk || now.getTime() - lastOk.getTime() > staleMs) {
    const since = status.failingSince ?? status.lastSuccessAt ?? status.lastRunAt;
    const when = since ? since.slice(0, 10) : "an unknown date";
    return {
      state: "failing",
      message: status.lastError
        ? `New course requests are not arriving from the Big Wedge app (since ${when}): ${status.lastError}`
        : `New course requests are not arriving from the Big Wedge app — the last successful pull was ${when}.`,
    };
  }
  return {
    state: "healthy",
    message: `Pulled from the Big Wedge app ${relative(lastOk, now)}${
      status.lastCreated > 0 ? ` · ${status.lastCreated} new` : ""
    }.`,
  };
}

function relative(then: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/**
 * The day the email route stopped delivering (last "New Feedback" email: 4 Aug 2026).
 * Before it, a request may already be on the board via that email, under no Big Wedge
 * reference — so only for those does a matching course NAME count as a duplicate.
 */
export const EMAIL_FEED_ENDED = "2026-08-05";

/**
 * Whether an incoming Big Wedge request duplicates a row already on the board.
 *
 * ⚠️ Matching by name for EVERY request — what the importer used to do — throws away
 * demand: each row is one golfer's submission (CLAUDE.md §45.3), so a second golfer
 * asking for a course already on the board is a second request, not a duplicate. The
 * name match is only a guard against the email route having already filed the same
 * submission, which can only have happened before EMAIL_FEED_ENDED.
 */
export function isDuplicateFeedRow(
  row: { externalRef: string; courseName: string; submittedAt: string | null },
  seen: { refs: ReadonlySet<string>; namesFromOtherSources: ReadonlySet<string> },
): boolean {
  if (seen.refs.has(row.externalRef)) return true;
  const beforeEmailEnded =
    !row.submittedAt || new Date(row.submittedAt).getTime() < new Date(`${EMAIL_FEED_ENDED}T00:00:00Z`).getTime();
  return beforeEmailEnded && seen.namesFromOtherSources.has(row.courseName.trim().toLowerCase());
}

/**
 * How long the feed must have been failing before the CLIENT's channel hears about it.
 * The feed runs hourly, so this is two failed runs in a row: one blip — a deploy restart,
 * a slow response — never reaches a channel Big Wedge reads.
 */
export const ALERT_AFTER_FAILING_MINUTES = 55;

/** No run at all for this long means the hourly schedule itself has stopped. */
export const STOPPED_AFTER_MINUTES = 125;

export type FeedAlert = { kind: "down"; reason: string } | { kind: "recovered"; caughtUp: number };

/**
 * Whether to post to the client's Slack channel, and what. Exactly one "down" per outage
 * (`alertedDownAt` is the latch) and one "recovered" when it ends. Pure.
 *
 * Down covers two cases: runs that are failing, AND runs that have stopped happening —
 * the second leaves no error anywhere, so only the clock can see it.
 */
export function feedAlert(status: CourseFeedStatus | null, now: Date): FeedAlert | null {
  if (!status?.lastRunAt) return null;
  const nowMs = now.getTime();
  const failingFor = status.failingSince ? nowMs - new Date(status.failingSince).getTime() : 0;
  const lastOk = status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : null;
  const stale = lastOk !== null && nowMs - lastOk > FEED_STALE_HOURS * 3_600_000;
  const stopped = nowMs - new Date(status.lastRunAt).getTime() > STOPPED_AFTER_MINUTES * 60_000;
  const down =
    Boolean(status.failingSince && failingFor >= ALERT_AFTER_FAILING_MINUTES * 60_000) || stale || stopped;

  if (down && !status.alertedDownAt) {
    return { kind: "down", reason: clientSafeReason(status, stopped) };
  }
  // Recovered: a success after the outage was announced.
  if (!down && !status.failingSince && status.alertedDownAt && lastOk !== null && lastOk > new Date(status.alertedDownAt).getTime()) {
    return { kind: "recovered", caughtUp: status.lastCreated };
  }
  return null;
}

/**
 * The reason, in words a client can read in their own channel. ⚠️ Never the raw error:
 * those name Foundry's own configuration (env var names), which is our plumbing.
 */
export function clientSafeReason(status: CourseFeedStatus, stoppedRunning: boolean): string {
  if (stoppedRunning) return "Foundry's hourly check has stopped running.";
  const e = (status.lastError ?? "").toLowerCase();
  if (e.includes("rejected foundry's login") || e.includes("no way to log in") || e.includes("expired")) {
    return "Foundry's login to the Big Wedge API is being refused.";
  }
  if (e.includes("could not reach") || e.includes("fetch failed") || e.includes("timeout") || /http 5\d\d/.test(e)) {
    return "the Big Wedge API isn't responding.";
  }
  return "the Big Wedge API returned something Foundry couldn't read.";
}

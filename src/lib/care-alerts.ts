/**
 * When Care tells someone that a desk has stopped working.
 *
 * Two things the module has measured all along and said nothing about:
 *
 *  • **A customer waiting too long.** `LONG_WAIT_HOURS` is Care's own alarm threshold — the
 *    point at which a wait "stops being informational and starts being a flag", in the words of
 *    the constant itself — and nothing was attached to it. The chip went amber on a screen
 *    nobody had open.
 *  • **A channel that has stopped delivering.** `ff19f83` taught a connector to go red after two
 *    consecutive failures and computed `justFailed` / `justRecovered` on every sync — and then
 *    discarded both. The latch was armed and persisted; nothing fired on it.
 *
 * An empty queue on a dead connector reads exactly like a quiet week, which is the single thing
 * a support desk most needs to be wrong about never.
 *
 * ⚠️ `LONG_WAIT_HOURS` lives here, not in `care-constants.tsx`, because that file imports
 * Heroicons and JSX — reaching for the threshold from a cron path would pull React into the
 * worker. `care-constants.tsx` re-exports it, so there stays exactly one number.
 */

/** A wait longer than this reads as a problem rather than a queue. Not an SLA. */
export const LONG_WAIT_HOURS = 24;

export function isLongWait(iso: string, now: number = Date.now()): boolean {
  return now - new Date(iso).getTime() >= LONG_WAIT_HOURS * 3600_000;
}

/** What a client's desk looks like right now, as far as alerting is concerned. */
export interface WaitAlertInput {
  /** The oldest awaiting conversation's inbound timestamp, or null when nobody is waiting. */
  oldestAwaitingAt: string | null;
  /** When this client's wait alert was last sent, or null if it is not currently in alarm. */
  alertedAt: Date | string | null;
  now?: Date;
}

export type CareAlert =
  /** Nobody has been told yet and someone has been waiting past the threshold. */
  | { kind: "waiting_too_long"; waitingSince: string; hours: number }
  /** We said a client was waiting; they are not any more. */
  | { kind: "caught_up" }
  | null;

/**
 * Whether to say something about this client's wait, and what.
 *
 * ⚠️ One alert per outage, not one per check. The latch is `alertedAt`: set when the alarm is
 * raised, cleared when the desk catches up. Without it a busy desk pages someone every minute
 * the worker runs, which trains people to mute it — and a muted alert is worse than none,
 * because it looks like cover.
 */
export function waitAlert(input: WaitAlertInput): CareAlert {
  const now = input.now ?? new Date();
  const alerted = input.alertedAt ? new Date(input.alertedAt) : null;
  const inAlarm = alerted !== null && !Number.isNaN(alerted.getTime());

  const breached =
    input.oldestAwaitingAt !== null && isLongWait(input.oldestAwaitingAt, now.getTime());

  if (breached && !inAlarm) {
    const waitingSince = input.oldestAwaitingAt as string;
    return {
      kind: "waiting_too_long",
      waitingSince,
      hours: Math.floor((now.getTime() - new Date(waitingSince).getTime()) / 3600_000),
    };
  }

  /*
   * ⚠️ Clearing needs the breach to be GONE, not merely smaller. A thread answered while an
   * older one is still waiting leaves the desk in alarm, which is correct: the oldest wait is
   * the figure the alert is about.
   */
  if (!breached && inAlarm) return { kind: "caught_up" };

  return null;
}

/** How an alert reads to the person it reaches. */
export function waitAlertWords(alert: Exclude<CareAlert, null>, clientName: string): { title: string; body: string } {
  if (alert.kind === "caught_up") {
    return {
      title: `${clientName}: caught up`,
      body: "Nobody has been waiting longer than a day. Nothing to do.",
    };
  }
  const days = Math.floor(alert.hours / 24);
  const waited = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${alert.hours} hours`;
  return {
    title: `${clientName}: a customer has waited ${waited}`,
    body: `Their oldest unanswered message came in ${waited} ago. Care has not replied to it.`,
  };
}

/** How a connector outage reads. The reason is the provider's, already in plain words. */
export function connectorAlertWords(input: {
  clientName: string;
  label: string;
  recovered: boolean;
  reason?: string | null;
}): { title: string; body: string } {
  if (input.recovered) {
    return {
      title: `${input.clientName}: ${input.label} is delivering again`,
      body: "The channel synced cleanly. Anything that arrived while it was down has been pulled in.",
    };
  }
  return {
    title: `${input.clientName}: ${input.label} has stopped delivering`,
    body:
      (input.reason?.trim() ? `${input.reason.trim()} ` : "") +
      "No mail is arriving on this channel, so its queue will look quiet whether or not it is.",
  };
}

/**
 * Compact "3h", "2d", "now" age from an ISO timestamp.
 *
 * Here rather than in `care-constants.tsx` for the same reason as the threshold: the digest and
 * the alerts run on a cron path, and that file imports Heroicons and JSX. `care-constants.tsx`
 * re-exports both, so every screen is unchanged and the wording on a Slack post and on the page
 * it links to cannot drift apart.
 *
 * Note it returns a bare duration, so a caller writing `{formatAge(x)} ago` produces "now ago"
 * for anything under a minute. Use `formatWhen` when the phrasing has to read as a sentence.
 */
export function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/**
 * The same age, phrased for prose: "just now" / "3h ago" / "2d ago".
 *
 * Exists because the detail header said *"answered now ago"* and *"waiting now"* — `formatAge`
 * returns a bare duration and "now" is not one, so every caller that appended "ago" was one
 * sub-minute message away from reading wrong.
 */
export function formatWhen(iso: string): string {
  const age = formatAge(iso);
  return age === "now" ? "just now" : `${age} ago`;
}

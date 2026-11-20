/**
 * Whether a Care connector is working — and the recovery path, which is the hard half.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────────────────────
 * `syncConnection` wrote `...(result.errors.length > 0 ? {} : { health: "CONNECTED" })`. Health
 * could therefore only ever go UP: a mailbox whose app password had been revoked kept the green
 * "Connected" badge for as long as anyone cared to look, while every run failed and no mail
 * arrived. Care's whole job is to say whether a customer is waiting, so a channel that has
 * silently stopped delivering is the worst thing it can be wrong about.
 *
 * ── Why two failures, not one ────────────────────────────────────────────────────────────────
 * A single failed run is a blip — a provider hiccup, a DNS wobble, a deploy restarting the box
 * mid-sync. Saying "this connector is broken" on one of those trains people to ignore the badge,
 * which costs more than the badge is worth. The same rule, for the same reason, is what
 * `monitor-alerts.ts` uses before it pages anyone.
 *
 * ── ⚠️ Degrading without widening the readers would be WORSE than the bug ────────────────────
 * The cron, `syncClientConnections` (the cockpit's own "Sync now") and all four reply
 * dispatchers filtered `health: "CONNECTED"`. Flip a connector to ERROR against that and it is
 * excluded from every path that could ever prove it healthy again — including the button a
 * person would press to fix it. It would be stuck, permanently, with no way back short of a
 * database edit. So:
 *
 *   • auto-sync keeps running on an ERROR connector, on a slower cadence (`syncDueAt`);
 *   • a person pressing "Sync now" always gets a try, whatever the health;
 *   • a reply is attempted and fails with the REAL reason, rather than Care claiming the client
 *     has no email connector at all, which is a different and false statement (§35).
 *
 * Only `NEEDS_SETUP` — a connector nobody has finished configuring — genuinely cannot send.
 */

/**
 * The stored health, mirroring Prisma's `ConnectionHealth` enum.
 *
 * ⚠️ NOT `@/types/support`'s `ConnectionHealth`, which is the lower-cased DTO the browser sees
 * ("connected"). This module reasons about the DATABASE value, and the two must not be confused:
 * comparing a row's `health` against "connected" silently never matches. Declared here rather
 * than imported from `@prisma/client` so the rules stay pure and unit-testable with no client
 * generated; `care-connector-health.test.ts` reads `schema.prisma` and fails if they drift.
 */
export type ConnectorHealth = "CONNECTED" | "NEEDS_SETUP" | "ERROR";

/** Consecutive failed runs before a connector is called broken rather than unlucky. */
export const HEALTH_ERROR_AFTER_FAILURES = 2;

/** First backoff for a failing connector, doubling per extra failure. */
export const ERROR_RETRY_BASE_MINUTES = 30;

/** However long it has been failing, try again at least this often. */
export const ERROR_RETRY_MAX_MINUTES = 360;

/** What a sync run leaves behind, carried on `AccountConnection.lastSyncStats`. */
export interface HealthState {
  /** Unbroken run of failures ending now. Zero means the last run worked. */
  consecutiveFailures: number;
  /** When the current run of failures began. Null when nothing is failing. */
  failingSince: string | null;
}

export interface HealthOutcome extends HealthState {
  health: ConnectorHealth;
  /** True only on the run that flips CONNECTED → ERROR, so an alert fires once per outage. */
  justFailed: boolean;
  /** True only on the run that flips ERROR → CONNECTED. */
  justRecovered: boolean;
}

/**
 * Where a connector stands after a run.
 *
 * `errors` is the run's own error list — `syncConnection` collects one per adapter problem, so a
 * run that returned any is a failed run.
 */
export function nextConnectorHealth(input: {
  previousHealth: ConnectorHealth;
  previous: HealthState;
  errors: readonly string[];
  now?: Date;
}): HealthOutcome {
  const now = input.now ?? new Date();
  const failed = input.errors.length > 0;

  if (!failed) {
    return {
      health: "CONNECTED",
      consecutiveFailures: 0,
      failingSince: null,
      justFailed: false,
      justRecovered: input.previousHealth === "ERROR",
    };
  }

  const consecutiveFailures = Math.max(0, input.previous.consecutiveFailures) + 1;
  const broken = consecutiveFailures >= HEALTH_ERROR_AFTER_FAILURES;
  return {
    // ⚠️ A connector nobody finished setting up stays NEEDS_SETUP. Calling it ERROR would say
    // "this broke", when the truth is that it was never connected — a different fix entirely.
    health: broken ? "ERROR" : input.previousHealth === "NEEDS_SETUP" ? "NEEDS_SETUP" : "CONNECTED",
    consecutiveFailures,
    failingSince: input.previous.failingSince ?? now.toISOString(),
    justFailed: broken && input.previousHealth !== "ERROR",
    justRecovered: false,
  };
}

/** Read the counters back off a `lastSyncStats` blob, tolerating every older shape. */
export function readHealthState(lastSyncStats: unknown): HealthState {
  const s = (lastSyncStats ?? {}) as { consecutiveFailures?: unknown; failingSince?: unknown };
  const n = typeof s.consecutiveFailures === "number" && Number.isFinite(s.consecutiveFailures)
    ? Math.max(0, Math.floor(s.consecutiveFailures))
    : 0;
  return {
    consecutiveFailures: n,
    failingSince: typeof s.failingSince === "string" ? s.failingSince : null,
  };
}

/** How long to wait before auto-retrying a connector that is failing. */
export function errorRetryMinutes(consecutiveFailures: number): number {
  const over = Math.max(0, consecutiveFailures - HEALTH_ERROR_AFTER_FAILURES);
  return Math.min(ERROR_RETRY_MAX_MINUTES, ERROR_RETRY_BASE_MINUTES * 2 ** over);
}

/**
 * Should the cron sync this connector now?
 *
 * ⚠️ Manual-only (`intervalMinutes <= 0`) wins over everything, health included. Someone set
 * that deliberately, and a failing connector is not a reason to start syncing one that was asked
 * not to be.
 */
export function isSyncDue(input: {
  health: ConnectorHealth;
  intervalMinutes: number;
  lastSyncedAt: Date | string | null;
  consecutiveFailures: number;
  now?: Date;
}): boolean {
  if (input.intervalMinutes <= 0) return false;
  // Never synced — due, however it is marked. This is also how a brand-new connector gets its
  // first run, so it must not be gated on health.
  if (!input.lastSyncedAt) return true;

  const waited = (input.now ?? new Date()).getTime() - new Date(input.lastSyncedAt).getTime();
  const minutes = input.health === "ERROR"
    ? Math.max(input.intervalMinutes, errorRetryMinutes(input.consecutiveFailures))
    : input.intervalMinutes;
  return waited >= minutes * 60_000;
}

/**
 * Can Care attempt to send through this connector?
 *
 * An ERROR connector is tried: the send either works (proving it recovered) or fails with the
 * provider's own reason, which is what the operator needs. Excluding it produced "No connected
 * email mailbox for this client" — a statement about the CLIENT that was simply untrue.
 */
export function connectorCanSend(health: ConnectorHealth): boolean {
  return health !== "NEEDS_SETUP";
}

/** The one Prisma filter for "a connector we may send through". */
export const SENDABLE_CONNECTION = { health: { not: "NEEDS_SETUP" } } as const;

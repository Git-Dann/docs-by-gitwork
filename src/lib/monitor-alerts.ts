/**
 * When a wiki uptime monitor should tell someone — pure, so the rules are tested.
 *
 * Written after Fellas Loaded went down with Google Cloud (Oct 2026) and the client told us
 * before anything in Foundry did. Three things had to be true for us to know, and none were:
 * the monitors had to be running, Fellas had to have one, and a failing check had to alert.
 * This is the third.
 *
 * - **Down** after `ALERT_AFTER_FAILURES` consecutive failed checks, so one blip never pages
 *   anyone — and ONCE per outage (`alertedDownAt` is the latch), not every five minutes.
 * - **Recovered** when a check passes after an alert went out, with how long it was down. A
 *   blip that never alerted recovers silently: a "back up" for a "down" nobody saw is noise.
 * - **Stale** when a monitor has not been checked for a while. The failure we actually had was
 *   the checker not running at all, which a check result can never report.
 */

export type ProbeStatus = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";

/** Two in a row: one failed check is a blip, two is an outage. At 5-minute intervals the
 *  alert lands 5–10 minutes after the service stops answering. */
export const ALERT_AFTER_FAILURES = 2;

export interface AlertState {
  failStreak: number;
  downSince: Date | null;
  alertedDownAt: Date | null;
}

export type AlertDecision =
  | { kind: "down"; since: Date; failures: number }
  | { kind: "recovered"; downForMs: number; since: Date }
  | null;

/** The next stored state after a check, and what (if anything) to tell people. */
export function nextAlertState(
  prev: AlertState,
  status: ProbeStatus,
  now: Date,
): { state: AlertState; alert: AlertDecision } {
  // UNKNOWN is "we could not tell", not "it is down" or "it is up" — it moves nothing.
  if (status === "UNKNOWN") return { state: prev, alert: null };

  if (status === "DOWN") {
    const failStreak = prev.failStreak + 1;
    const downSince = prev.downSince ?? now;
    if (failStreak >= ALERT_AFTER_FAILURES && !prev.alertedDownAt) {
      return {
        state: { failStreak, downSince, alertedDownAt: now },
        alert: { kind: "down", since: downSince, failures: failStreak },
      };
    }
    return { state: { failStreak, downSince, alertedDownAt: prev.alertedDownAt }, alert: null };
  }

  // UP or DEGRADED — it answered. DEGRADED is slow, not down; it does not page anyone.
  const cleared: AlertState = { failStreak: 0, downSince: null, alertedDownAt: null };
  if (prev.alertedDownAt) {
    const since = prev.downSince ?? prev.alertedDownAt;
    return { state: cleared, alert: { kind: "recovered", downForMs: now.getTime() - since.getTime(), since } };
  }
  return { state: cleared, alert: null };
}

/** How long without a check before a monitor counts as not being checked at all. */
export function staleAfterMs(intervalMinutes: number): number {
  return Math.max(intervalMinutes * 3, 30) * 60 * 1000;
}

/**
 * Not checked recently enough to trust its status. A monitor that has never been checked is
 * stale only once it is older than the window — a brand-new one is waiting for its first run.
 */
export function isStale(
  m: { enabled: boolean; lastCheckedAt: Date | null; createdAt: Date; intervalMinutes: number },
  now: Date,
): boolean {
  if (!m.enabled) return false;
  const since = m.lastCheckedAt ?? m.createdAt;
  return now.getTime() - since.getTime() > staleAfterMs(m.intervalMinutes);
}

/** "4 min", "2 h 5 min", "3 days" — for "down for" and "not checked for". */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 48) return rem ? `${h} h ${rem} min` : `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/** "14:05 UTC" — the alert's timestamp, in one zone so a channel reads consistently. */
export function clockTime(d: Date): string {
  return `${d.toISOString().slice(11, 16)} UTC`;
}

export interface MonitorAlertContext {
  clientName: string;
  monitorName: string;
  target: string;
}

/** The Slack/notification text for a down or recovered alert. */
export function alertMessage(
  ctx: MonitorAlertContext,
  alert: NonNullable<AlertDecision>,
  detail: { statusCode: number | null; error: string | null },
): { title: string; body: string } {
  if (alert.kind === "down") {
    const why = detail.statusCode ? `HTTP ${detail.statusCode}` : detail.error ?? "no response";
    return {
      title: `🔴 ${ctx.clientName} — ${ctx.monitorName} is down`,
      body: `${ctx.target}\nFailing since ${clockTime(alert.since)} (${alert.failures} checks in a row) · ${why}`,
    };
  }
  return {
    title: `🟢 ${ctx.clientName} — ${ctx.monitorName} is back up`,
    body: `${ctx.target}\nDown for ${formatDuration(alert.downForMs)}, from ${clockTime(alert.since)}`,
  };
}

/** The watchdog's text when monitors have stopped being checked. */
export function staleMessage(
  stale: { clientName: string; monitorName: string; lastCheckedAt: Date | null }[],
  now: Date,
): { title: string; body: string } {
  const lines = stale.slice(0, 10).map((s) =>
    `• ${s.clientName} — ${s.monitorName}: ${s.lastCheckedAt ? `last checked ${formatDuration(now.getTime() - s.lastCheckedAt.getTime())} ago` : "never checked"}`,
  );
  if (stale.length > 10) lines.push(`…and ${stale.length - 10} more`);
  return {
    title: `⚠️ Uptime monitors have stopped checking (${stale.length})`,
    body: `${lines.join("\n")}\nThe 5-minute wiki-monitors job may have stopped — nothing is watching these until it runs again.`,
  };
}

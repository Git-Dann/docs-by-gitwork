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

/** Flaky: this many failures among the last `WINDOW` checks (including the current one). */
export const FLAKY_FAILURES = 3;
export const WINDOW = 6;

export type AlertKind = "down" | "flaky";

export interface AlertState {
  failStreak: number;
  downSince: Date | null;
  alertedDownAt: Date | null;
  /** What the open alert is about — decides how it clears. Null when nothing is open. */
  alertKind: AlertKind | null;
  /** When the last alert cleared. Failures before it never count toward a new one. */
  alertClearedAt: Date | null;
}

export type AlertDecision =
  | { kind: "down"; since: Date; failures: number }
  | { kind: "flaky"; since: Date; failures: number; of: number }
  | { kind: "recovered"; downForMs: number; since: Date }
  | { kind: "stable"; downForMs: number; since: Date }
  | null;

/**
 * The next stored state after a check, and what (if anything) to tell people.
 *
 * `recent` is the statuses of the checks BEFORE this one, oldest first, since the last alert
 * cleared — the caller filters by `alertClearedAt`, so an outage that has already been reported
 * and recovered can't be re-counted into a fresh "unstable" a minute later.
 *
 * Two rules, because outages come in two shapes. Google's London power event (20 Oct 2026)
 * left some services hard down and others "intermittently erroring"; a two-in-a-row rule
 * alone never fires on a service that fails every other check.
 * - **down** — `ALERT_AFTER_FAILURES` in a row. Clears on the first passing check.
 * - **flaky** — `FLAKY_FAILURES` of the last `WINDOW` checks. Clears only once a whole window
 *   passes, so a service flapping up and down produces ONE "unstable" and ONE "stable again",
 *   not a message every five minutes. If it then fails twice in a row it escalates to down.
 */
export function nextAlertState(
  prev: AlertState,
  status: ProbeStatus,
  now: Date,
  recent: ProbeStatus[] = [],
): { state: AlertState; alert: AlertDecision } {
  // UNKNOWN is "we could not tell", not "it is down" or "it is up" — it moves nothing.
  if (status === "UNKNOWN") return { state: prev, alert: null };

  const isDown = status === "DOWN";
  const failStreak = isDown ? prev.failStreak + 1 : 0;
  const window = [...recent.slice(-(WINDOW - 1)), status];
  const downsInWindow = window.filter((x) => x === "DOWN").length;
  // When this run of trouble began: the first failure we're still counting.
  const downSince = isDown ? prev.downSince ?? now : prev.downSince;

  // ── Nothing open ──
  if (!prev.alertKind) {
    if (isDown && failStreak >= ALERT_AFTER_FAILURES) {
      const since = downSince ?? now;
      return {
        state: { ...prev, failStreak, downSince: since, alertedDownAt: now, alertKind: "down" },
        alert: { kind: "down", since, failures: failStreak },
      };
    }
    if (downsInWindow >= FLAKY_FAILURES) {
      const since = downSince ?? now;
      return {
        state: { ...prev, failStreak, downSince: since, alertedDownAt: now, alertKind: "flaky" },
        alert: { kind: "flaky", since, failures: downsInWindow, of: window.length },
      };
    }
    // A failure that hasn't (yet) earned an alert keeps its start time; a pass with nothing
    // open forgets it — a blip that never alerted recovers silently.
    return {
      state: { ...prev, failStreak, downSince: isDown ? downSince : downsInWindow > 0 ? prev.downSince : null },
      alert: null,
    };
  }

  const since = prev.downSince ?? prev.alertedDownAt ?? now;
  const cleared = (): AlertState => ({
    failStreak: 0,
    downSince: null,
    alertedDownAt: null,
    alertKind: null,
    alertClearedAt: now,
  });

  // ── A "down" alert is open: the first check that answers clears it. ──
  if (prev.alertKind === "down") {
    if (!isDown) {
      return { state: cleared(), alert: { kind: "recovered", downForMs: now.getTime() - since.getTime(), since } };
    }
    return { state: { ...prev, failStreak }, alert: null };
  }

  // ── A "flaky" alert is open. ──
  if (isDown && failStreak >= ALERT_AFTER_FAILURES) {
    // It stopped flapping and went properly down — say so, once.
    return {
      state: { ...prev, failStreak, alertedDownAt: now, alertKind: "down" },
      alert: { kind: "down", since, failures: failStreak },
    };
  }
  if (window.length >= WINDOW && downsInWindow === 0) {
    return { state: cleared(), alert: { kind: "stable", downForMs: now.getTime() - since.getTime(), since } };
  }
  return { state: { ...prev, failStreak }, alert: null };
}

/**
 * While something is failing it's re-checked every minute, not on its normal interval — the
 * usual practice for uptime monitoring (Dan, Oct 2026: "when something goes down we need to be
 * checking every 5/10/15 mins, whatever is best practice"). An outage is confirmed in about a
 * minute instead of five, and "back up" lands within a minute of the service recovering.
 * Healthy monitors stay on their own interval, so this costs nothing until something breaks.
 */
export const FAILING_RECHECK_MINUTES = 1;

/**
 * How long after a FIRST failure to check again, instead of waiting for the next run. Two
 * failures in a row is still the rule (one blip never pages anyone), but the second one comes
 * 20 seconds later rather than minutes later — so a real outage alerts within about 20 seconds
 * of being spotted, and a blip that recovers in that time stays quiet.
 */
export const CONFIRM_AFTER_MS = 20_000;

/** Re-check straight away: this check failed, it is the first in a row, and nothing is open. */
export function shouldConfirm(status: ProbeStatus, state: Pick<AlertState, "failStreak" | "alertKind">): boolean {
  return status === "DOWN" && state.failStreak === 1 && state.alertKind === null;
}

/** Failing = the last check failed, a failure streak is running, or an alert is still open. */
export function isFailing(m: { lastStatus: string; failStreak: number; alertKind: string | null }): boolean {
  return m.lastStatus === "DOWN" || m.failStreak > 0 || m.alertKind !== null;
}

/** How often a monitor is checked right now: its own interval, or every minute while failing. */
export function checkEveryMs(m: {
  intervalMinutes: number;
  lastStatus: string;
  failStreak: number;
  alertKind: string | null;
}): number {
  const minutes = isFailing(m) ? Math.min(FAILING_RECHECK_MINUTES, m.intervalMinutes) : m.intervalMinutes;
  return minutes * 60 * 1000;
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

/** The Slack/notification text for an alert. */
export function alertMessage(
  ctx: MonitorAlertContext,
  alert: NonNullable<AlertDecision>,
  detail: { statusCode: number | null; error: string | null },
): { title: string; body: string } {
  const why = detail.statusCode ? `HTTP ${detail.statusCode}` : detail.error ?? "no response";
  switch (alert.kind) {
    case "down":
      return {
        title: `🔴 ${ctx.clientName} — ${ctx.monitorName} is down`,
        body: `${ctx.target}\nFailing since ${clockTime(alert.since)} (${alert.failures} checks in a row) · ${why}`,
      };
    case "flaky":
      return {
        title: `🟠 ${ctx.clientName} — ${ctx.monitorName} is unstable`,
        body: `${ctx.target}\n${alert.failures} of the last ${alert.of} checks failed, since ${clockTime(alert.since)} · latest: ${why}`,
      };
    case "recovered":
      return {
        title: `🟢 ${ctx.clientName} — ${ctx.monitorName} is back up`,
        body: `${ctx.target}\nDown for ${formatDuration(alert.downForMs)}, from ${clockTime(alert.since)}`,
      };
    case "stable":
      return {
        title: `🟢 ${ctx.clientName} — ${ctx.monitorName} is stable again`,
        body: `${ctx.target}\nNo failed checks in the last ${WINDOW}; unstable for ${formatDuration(alert.downForMs)}, from ${clockTime(alert.since)}`,
      };
  }
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

// ─── Slack layout — modelled on GitHub Status's channel posts (Dan, Oct 2026) ─────────────

/** One service on the client, as the post lists it — GitHub Status's "components" rows. */
export interface ServiceRow {
  name: string;
  /** Latest status. `flaky` = an "unstable" alert is open; `stale` = not being checked. */
  state: "up" | "slow" | "down" | "flaky" | "stale";
}

const ROW_ICON: Record<ServiceRow["state"], string> = {
  up: ":white_check_mark:",
  slow: ":large_yellow_circle:",
  flaky: ":large_orange_circle:",
  down: ":red_circle:",
  stale: ":white_circle:",
};
const ROW_NOTE: Partial<Record<ServiceRow["state"], string>> = {
  slow: " — slow",
  flaky: " — unstable",
  down: " — down",
  stale: " — not being checked",
};

/** The incident line GitHub leads with — "Incident: Resolved" etc. */
export function incidentHeading(kind: NonNullable<AlertDecision>["kind"] | "stalled"): string {
  switch (kind) {
    case "down":
      return "Incident: Down";
    case "flaky":
      return "Incident: Degraded";
    case "recovered":
    case "stable":
      return "Incident: Resolved";
    case "stalled":
      return "Monitoring: Stopped";
  }
}

/** Slack mrkdwn needs &, < and > escaped in text it should not treat as markup. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The Block Kit post: incident line, linked title, what happened, every service on the client
 * with its status, an "Open in Foundry" button, and a quiet footer. Slack caps a message at
 * 50 blocks, so the service list stops at 20 with a "+N more" line.
 */
export function alertBlocks(input: {
  heading: string;
  title: string;
  /** Absolute link into Foundry. */
  url: string;
  description: string;
  services: ServiceRow[];
  footer: string;
  /**
   * The button under the service list — GitHub's "View all updates". Defaults to "Open in
   * Foundry" on `url`; monitor alerts point it at the all-clients board instead.
   */
  button?: { label: string; url: string };
}): unknown[] {
  const shown = input.services.slice(0, 20);
  const more = input.services.length - shown.length;
  return [
    { type: "section", text: { type: "mrkdwn", text: `*${esc(input.heading)}*` } },
    { type: "section", text: { type: "mrkdwn", text: `*<${input.url}|${esc(input.title)}>*` } },
    { type: "section", text: { type: "mrkdwn", text: esc(input.description) } },
    ...shown.map((r) => ({
      type: "context",
      elements: [{ type: "mrkdwn", text: `${ROW_ICON[r.state]}  ${esc(r.name)}${ROW_NOTE[r.state] ?? ""}` }],
    })),
    ...(more > 0 ? [{ type: "context", elements: [{ type: "mrkdwn", text: `+${more} more` }] }] : []),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: input.button?.label ?? "Open in Foundry" },
          url: input.button?.url ?? input.url,
        },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: esc(input.footer) }] },
  ];
}

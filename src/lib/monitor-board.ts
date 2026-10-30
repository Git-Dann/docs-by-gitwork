/**
 * The all-clients monitor board — the Gitwork wiki's Monitors section (Dan, Oct 2026: "bring
 * ALL monitors and statuses into Gitwork from all clients", like the Command Centre board).
 *
 * Pure, so the rules that decide what the headline says are tested. The server reads every
 * monitor once (`src/server/wiki-monitor-board.ts`); this file turns that into groups and a
 * headline. Nothing here is ever sent to a client: the board is internal-only.
 */

import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";

export type BoardMonitorState = "up" | "slow" | "flaky" | "down" | "stale" | "pending";

export interface BoardMonitor {
  id: string;
  name: string;
  target: string;
  /** Latest probe status as stored. */
  status: "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
  /** Not checked recently enough to trust `status` (see `isStale`). */
  stale: boolean;
  /** An open alert, if any — "flaky" means the "unstable" alert is open. */
  alertKind: string | null;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: string | null;
  /** When the current run of failures began, if one is running. */
  downSince: string | null;
  /** Uptime % over the last 24h; null when there were no checks. */
  uptime24h: number | null;
}

export interface BoardClient {
  clientId: string;
  slug: string;
  name: string;
  monitors: BoardMonitor[];
}

/**
 * One monitor's state. A stale monitor is never shown as its last result — the checker
 * stopping is exactly the failure that left every monitor reading UP for 2½ months.
 */
export function monitorState(m: BoardMonitor): BoardMonitorState {
  if (m.stale) return "stale";
  if (m.status === "DOWN") return "down";
  if (m.alertKind === "flaky") return "flaky";
  if (m.status === "DEGRADED") return "slow";
  if (m.status === "UNKNOWN") return "pending";
  return "up";
}

/** Worst first. Not checking outranks slow: a status we can't trust says more than a slow one. */
const SEVERITY: Record<BoardMonitorState, number> = {
  up: 0,
  pending: 1,
  slow: 2,
  stale: 3,
  flaky: 4,
  down: 5,
};

export function worstState(states: BoardMonitorState[]): BoardMonitorState | null {
  if (states.length === 0) return null;
  return states.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}

export type BoardLevel = "operational" | "degraded" | "outage" | "unchecked" | "empty";

export interface BoardSummary {
  level: BoardLevel;
  headline: string;
  /** "11/12 services up · 7 clients" */
  sub: string;
  total: number;
  up: number;
  down: number;
  /** Slow or unstable — answering, but not well. */
  degraded: number;
  /** Not being checked, or not checked yet. */
  unchecked: number;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the board says first. Down beats everything — the one thing nobody may miss — then
 * degraded, then "not being checked". "All systems operational" only when every monitor was
 * actually checked and answered.
 */
export function summariseBoard(clients: BoardClient[]): BoardSummary {
  const states = clients.flatMap((c) => c.monitors.map(monitorState));
  const total = states.length;
  const count = (...s: BoardMonitorState[]) => states.filter((x) => s.includes(x)).length;
  const up = count("up");
  const down = count("down");
  const degraded = count("slow", "flaky");
  const unchecked = count("stale", "pending");
  const monitored = clients.filter((c) => c.monitors.length > 0).length;
  const sub = total === 0 ? "No monitors yet" : `${up}/${total} services up · ${plural(monitored, "client")}`;

  if (total === 0) return { level: "empty", headline: "No monitors yet", sub, total, up, down, degraded, unchecked };
  if (down > 0) {
    const where = clients
      .filter((c) => c.monitors.some((m) => monitorState(m) === "down"))
      .map((c) => c.name);
    const headline = `${plural(down, "service")} down — ${where.join(", ")}`;
    return { level: "outage", headline, sub, total, up, down, degraded, unchecked };
  }
  if (degraded > 0) {
    return { level: "degraded", headline: `${plural(degraded, "service")} degraded`, sub, total, up, down, degraded, unchecked };
  }
  if (unchecked > 0) {
    return { level: "unchecked", headline: `${plural(unchecked, "service")} not being checked`, sub, total, up, down, degraded, unchecked };
  }
  return { level: "operational", headline: "All systems operational", sub, total, up, down, degraded, unchecked };
}

/**
 * Gitwork's own services first (they're everyone's problem), then any client with something
 * wrong, worst first, then the rest by name. Clients with no monitors are listed apart.
 */
export function orderBoard(clients: BoardClient[]): { monitored: BoardClient[]; unmonitored: BoardClient[] } {
  const monitored = clients.filter((c) => c.monitors.length > 0);
  const unmonitored = clients.filter((c) => c.monitors.length === 0).sort((a, b) => a.name.localeCompare(b.name));
  const rank = (c: BoardClient) => SEVERITY[worstState(c.monitors.map(monitorState)) ?? "up"];
  monitored.sort((a, b) => {
    const agency = Number(b.slug === AGENCY_CLIENT_SLUG) - Number(a.slug === AGENCY_CLIENT_SLUG);
    if (agency) return agency;
    const severity = rank(b) - rank(a);
    if (severity) return severity;
    return a.name.localeCompare(b.name);
  });
  return { monitored, unmonitored };
}

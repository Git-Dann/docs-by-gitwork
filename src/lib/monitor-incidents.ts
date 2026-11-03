/**
 * Incidents on uptime monitors — pure rules shared by the server, the internal boards and the
 * client's board. An incident opens when a monitor's down/unstable alert fires and resolves when
 * its recovery alert does (src/lib/monitor-alerts.ts), so there is exactly one per outage.
 */

export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring a fix",
  resolved: "Resolved",
};

export const MAX_UPDATE_LENGTH = 2000;

export function isIncidentStatus(v: unknown): v is IncidentStatus {
  return typeof v === "string" && (INCIDENT_STATUSES as readonly string[]).includes(v);
}

export interface IncidentUpdateDTO {
  id: string;
  status: IncidentStatus;
  message: string;
  isPublic: boolean;
  automatic: boolean;
  authorName: string | null;
  createdAt: string;
}

export interface IncidentDTO {
  id: string;
  monitorId: string;
  monitorName: string;
  kind: "down" | "flaky";
  title: string;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  /** Null in the client's copy: who on Gitwork's team picked it up stays internal. */
  acknowledgedByName: string | null;
  /** The latest update's status, or investigating. */
  status: IncidentStatus;
  updates: IncidentUpdateDTO[];
}

/** What to write when an alert fires. Null when the alert doesn't open or close an incident. */
export function incidentChangeFor(
  alert: { kind: "down" | "flaky" | "recovered" | "stable"; downForMs?: number } | null,
  monitorName: string,
  error: string | null,
):
  | { open: { kind: "down" | "flaky"; title: string; message: string } }
  | { resolve: { message: string } }
  | null {
  if (!alert) return null;
  if (alert.kind === "down") {
    return {
      open: {
        kind: "down",
        title: `${monitorName} is down`,
        message: `Detected automatically: ${monitorName} stopped responding${error ? ` (${error})` : ""}.`,
      },
    };
  }
  if (alert.kind === "flaky") {
    return {
      open: {
        kind: "flaky",
        title: `${monitorName} is unstable`,
        message: `Detected automatically: ${monitorName} is failing some of its checks.`,
      },
    };
  }
  const forText = alert.downForMs != null ? ` after ${formatShortDuration(alert.downForMs)}` : "";
  return {
    resolve: {
      message:
        alert.kind === "stable"
          ? `${monitorName} has been stable again${forText}.`
          : `${monitorName} is responding again${forText}.`,
    },
  };
}

function formatShortDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

/** The client's copy: public updates only, and no names from Gitwork's side. */
export function publicIncident(i: IncidentDTO): IncidentDTO {
  return {
    ...i,
    acknowledgedByName: null,
    updates: i.updates.filter((u) => u.isPublic).map((u) => ({ ...u, authorName: u.automatic ? null : "Gitwork" })),
  };
}

/** Open incidents first (newest first), then resolved ones, newest first. */
export function sortIncidents<T extends { resolvedAt: string | null; startedAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!a.resolvedAt !== !b.resolvedAt) return a.resolvedAt ? 1 : -1;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

/** How long the incident has run (to now while open), e.g. "42 min". */
export function incidentLength(i: { startedAt: string; resolvedAt: string | null }, now: Date): string {
  const end = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now.getTime();
  return formatShortDuration(end - new Date(i.startedAt).getTime());
}

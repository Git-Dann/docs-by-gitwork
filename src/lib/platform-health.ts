/**
 * Foundry's own health, for the Platform popup on the Monitors page (CLAUDE.md §144). Pure, so
 * the judgement of each part is tested; src/server/platform-health.ts reads the facts.
 *
 * Every part says what it could and couldn't read. A part that couldn't be read is "unknown",
 * never "ok": "we couldn't look" must not read as "fine" (CLAUDE.md §35).
 */

import { DB_GROWTH_ALERT_MIN_BYTES, DB_GROWTH_ALERT_SHARE, DISK_ALERT_AT } from "@/lib/disk-watch";

export type HealthLevel = "ok" | "attention" | "problem" | "unknown";

export interface JobStatus {
  name: string;
  /** ISO, or null when it hasn't run since the watch began. */
  lastRun: string | null;
  maxGapMinutes: number;
  stale: boolean;
}

export interface PlatformHealth {
  readAt: string;
  jobs: JobStatus[] | null;
  disk: { usedShare: number; freeBytes: number; totalBytes: number } | null;
  database: { bytes: number | null; weekAgoBytes: number | null; growthShare: number | null } | null;
  memory: { usedBytes: number; limitBytes: number | null; peakBytes: number | null; hostBytes: number } | null;
  backups: { state: "off" | "misconfigured" | "on"; reason: string | null; lastOk: string | null };
  alerts: { slack: boolean };
}

export type PartKey = "jobs" | "disk" | "database" | "memory" | "backups" | "alerts";

export interface Part {
  key: PartKey;
  label: string;
  level: HealthLevel;
  /** One line for the list. */
  summary: string;
}

const MEMORY_WARN_AT = 0.85;
const BACKUP_STALE_MS = 36 * 3_600_000;

export function judge(h: PlatformHealth, now: Date = new Date(h.readAt)): Part[] {
  const parts: Part[] = [];

  if (!h.jobs) parts.push({ key: "jobs", label: "Scheduled jobs", level: "unknown", summary: "Couldn't read when the jobs last ran" });
  else {
    const stale = h.jobs.filter((j) => j.stale);
    parts.push({
      key: "jobs",
      label: "Scheduled jobs",
      level: stale.length ? "problem" : "ok",
      summary: stale.length ? `${stale.length} stopped: ${stale.map((j) => j.name).join(", ")}` : `All ${h.jobs.length} running`,
    });
  }

  if (!h.disk) parts.push({ key: "disk", label: "Disk", level: "unknown", summary: "Couldn't read the disk" });
  else {
    const pct = Math.round(h.disk.usedShare * 100);
    parts.push({ key: "disk", label: "Disk", level: h.disk.usedShare >= DISK_ALERT_AT ? "problem" : "ok", summary: `${pct}% used` });
  }

  if (!h.database || h.database.bytes == null) {
    parts.push({ key: "database", label: "Database", level: "unknown", summary: "Couldn't read its size" });
  } else {
    const g = h.database.growthShare;
    const grew = h.database.weekAgoBytes != null ? h.database.bytes - h.database.weekAgoBytes : 0;
    const fast = g != null && g >= DB_GROWTH_ALERT_SHARE && grew >= DB_GROWTH_ALERT_MIN_BYTES;
    parts.push({
      key: "database",
      label: "Database",
      level: fast ? "attention" : "ok",
      summary: g == null ? "Growth known after a week of readings" : `${g >= 0 ? "+" : ""}${Math.round(g * 100)}% in a week`,
    });
  }

  if (!h.memory) parts.push({ key: "memory", label: "Memory", level: "unknown", summary: "Couldn't read the app's memory" });
  else {
    const share = h.memory.limitBytes ? h.memory.usedBytes / h.memory.limitBytes : null;
    parts.push({
      key: "memory",
      label: "Memory",
      level: share != null && share >= MEMORY_WARN_AT ? "attention" : "ok",
      summary: share != null ? `${Math.round(share * 100)}% of the app's cap` : "No cap set on the app",
    });
  }

  const b = h.backups;
  if (b.state === "off") parts.push({ key: "backups", label: "Off-site backups", level: "attention", summary: "Off: no bucket set yet" });
  else if (b.state === "misconfigured") parts.push({ key: "backups", label: "Off-site backups", level: "problem", summary: "Set up wrongly" });
  else {
    const fresh = b.lastOk ? now.getTime() - Date.parse(b.lastOk) <= BACKUP_STALE_MS : false;
    parts.push({ key: "backups", label: "Off-site backups", level: fresh ? "ok" : "problem", summary: b.lastOk ? (fresh ? "Last one in the past day" : "None in over a day") : "None made yet" });
  }

  parts.push({
    key: "alerts",
    label: "Alerts to Slack",
    level: h.alerts.slack ? "ok" : "attention",
    summary: h.alerts.slack ? "On" : "Off: Foundry only",
  });

  return parts;
}

const RANK: Record<HealthLevel, number> = { problem: 3, unknown: 2, attention: 1, ok: 0 };

/** The worst part decides the button's dot. */
export function overall(parts: readonly Part[]): HealthLevel {
  return parts.reduce<HealthLevel>((worst, p) => (RANK[p.level] > RANK[worst] ? p.level : worst), "ok");
}

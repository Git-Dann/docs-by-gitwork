/**
 * Reads Foundry's own health for the Platform popup on the Monitors page (rules and wording in
 * src/lib/platform-health.ts). Each part is read on its own: one that fails is null and shows as
 * "couldn't read", never as fine.
 */

import { readFile } from "node:fs/promises";
import { totalmem } from "node:os";
import { weeklyGrowth } from "@/lib/disk-watch";
import type { PlatformHealth } from "@/lib/platform-health";
import { cronHealth } from "@/server/cron-watchdog";
import { backupConfig } from "@/server/db-backup";
import { readDisk } from "@/server/disk-watch";
import { readDaily, readSystemMarkers } from "@/server/system-markers";

async function readNumber(path: string): Promise<number | null> {
  try {
    const raw = (await readFile(path, "utf8")).trim();
    if (raw === "max") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** The app container's memory from its cgroup (v2), else this process's own. */
async function readMemory(): Promise<PlatformHealth["memory"]> {
  const current = await readNumber("/sys/fs/cgroup/memory.current");
  const limit = await readNumber("/sys/fs/cgroup/memory.max");
  const peak = await readNumber("/sys/fs/cgroup/memory.peak");
  return {
    usedBytes: current ?? process.memoryUsage().rss,
    limitBytes: limit,
    peakBytes: peak,
    hostBytes: totalmem(),
  };
}

export async function readPlatformHealth(now: Date = new Date()): Promise<PlatformHealth> {
  const safe = async <T,>(run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      console.warn(`[platform-health] ${err instanceof Error ? err.message : err}`);
      return null;
    }
  };

  const [jobs, disk, series, memory, markers] = await Promise.all([
    safe(async () => (await cronHealth(now)).jobs),
    safe(() => readDisk()),
    safe(() => readDaily("db-size")),
    safe(() => readMemory()),
    safe(() => readSystemMarkers(["db-backup-ok"])),
  ]);

  const growth = series ? weeklyGrowth(series.map((r) => ({ at: r.at, bytes: r.value })), now) : null;
  const config = backupConfig();
  return {
    readAt: now.toISOString(),
    jobs,
    disk: disk ? { usedShare: disk.usedShare, freeBytes: disk.freeBytes, totalBytes: disk.totalBytes } : null,
    database: disk ? { bytes: disk.databaseBytes, weekAgoBytes: growth?.from ?? null, growthShare: growth?.share ?? null } : null,
    memory,
    backups: {
      state: "skipped" in config ? "off" : "error" in config ? "misconfigured" : "on",
      reason: "error" in config ? config.error : null,
      lastOk: markers?.["db-backup-ok"]?.toISOString() ?? null,
    },
    alerts: { slack: Boolean(process.env.SLACK_OPS_WEBHOOK_URL?.trim()) },
  };
}

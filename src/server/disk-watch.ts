/**
 * The server's disk and the database's size, checked hourly from the `jobs` worker
 * (CLAUDE.md §144). Alerts once when the disk passes 80% used and once when it drops back below
 * 75% (latch: system marker `disk-alert`).
 *
 * Reads the container's root filesystem, which is the host disk Docker keeps its images,
 * volumes (Postgres included) and logs on.
 */

import { statfs } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { diskAlertChange, formatBytes } from "@/lib/disk-watch";
import { clearSystem, markSystem, readSystemMarkers } from "@/server/system-markers";
import { sendOpsAlert } from "@/server/ops-alert";

const CHECKED = "disk-checked";
const ALERTED = "disk-alert";
const EVERY_MS = 60 * 60_000;

export interface DiskReading {
  usedShare: number;
  freeBytes: number;
  totalBytes: number;
  databaseBytes: number | null;
}

export async function readDisk(path = "/"): Promise<DiskReading> {
  const s = await statfs(path);
  const total = s.blocks * s.bsize;
  // bavail, not bfree: what an ordinary process (Postgres) can still write.
  const free = s.bavail * s.bsize;
  let databaseBytes: number | null = null;
  try {
    const rows = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    databaseBytes = rows[0] ? Number(rows[0].size) : null;
  } catch {
    databaseBytes = null;
  }
  return { usedShare: total > 0 ? 1 - free / total : 0, freeBytes: free, totalBytes: total, databaseBytes };
}

export async function checkDiskAndDatabase(now: Date = new Date()): Promise<DiskReading | null> {
  const markers = await readSystemMarkers([CHECKED, ALERTED]);
  const last = markers[CHECKED];
  if (last && now.getTime() - last.getTime() < EVERY_MS) return null;
  await markSystem(CHECKED, now);

  const reading = await readDisk();
  const change = diskAlertChange(reading.usedShare, Boolean(markers[ALERTED]));
  const pct = Math.round(reading.usedShare * 100);
  const db = reading.databaseBytes != null ? ` The database is ${formatBytes(reading.databaseBytes)}.` : "";
  if (change === "alert") {
    await sendOpsAlert({
      key: "disk",
      title: `The server's disk is ${pct}% full`,
      body: `${formatBytes(reading.freeBytes)} free of ${formatBytes(reading.totalBytes)}.${db} Postgres stops accepting writes when it fills: prune old Docker images and logs, or add disk.`,
    });
    await markSystem(ALERTED, now);
  } else if (change === "clear") {
    await sendOpsAlert({ key: "disk", level: "resolved", title: `The server's disk is back to ${pct}% full`, body: db.trim() || undefined });
    await clearSystem(ALERTED);
  }
  return reading;
}

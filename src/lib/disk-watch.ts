/**
 * When to warn about the server's disk (CLAUDE.md §144). Pure, so the thresholds are tested.
 *
 * Postgres stops accepting writes when its disk fills, and so does Docker, so a full disk takes
 * the whole of Foundry down. Warn at 80% used, once; say it's fine again only below 75%, so a
 * disk sitting at 79–81% doesn't post every hour.
 */

export const DISK_ALERT_AT = 0.8;
export const DISK_CLEAR_BELOW = 0.75;

export function diskAlertChange(usedShare: number, alerted: boolean): "alert" | "clear" | null {
  if (!alerted && usedShare >= DISK_ALERT_AT) return "alert";
  if (alerted && usedShare < DISK_CLEAR_BELOW) return "clear";
  return null;
}

/** "12.4 GB" from bytes (decimal units, as `df -H` shows them). */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Warn when the database grew by this share in about a week… */
export const DB_GROWTH_ALERT_SHARE = 0.25;
/** …and by at least this much, so a small database doubling from 40 MB to 80 MB says nothing. */
export const DB_GROWTH_ALERT_MIN_BYTES = 1_000_000_000;
/** Clear only once the week's growth is back under this share. */
export const DB_GROWTH_CLEAR_SHARE = 0.1;

export interface SizeReading {
  at: Date;
  bytes: number;
}

/**
 * How much the database grew over about a week: today's size against the reading closest to
 * 7 days ago, taken from readings 6 to 8 days old. Null when there's no reading that old yet
 * (the first week after this shipped), so "can't tell yet" never reads as "no growth".
 */
export function weeklyGrowth(readings: readonly SizeReading[], now: Date): { from: number; to: number; share: number } | null {
  if (readings.length === 0) return null;
  const latest = [...readings].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const target = now.getTime() - 7 * 86_400_000;
  const old = readings
    .filter((r) => {
      const age = now.getTime() - r.at.getTime();
      return age >= 6 * 86_400_000 && age <= 8 * 86_400_000;
    })
    .sort((a, b) => Math.abs(a.at.getTime() - target) - Math.abs(b.at.getTime() - target))[0];
  if (!old || old.bytes <= 0) return null;
  return { from: old.bytes, to: latest.bytes, share: (latest.bytes - old.bytes) / old.bytes };
}

export function dbGrowthAlertChange(
  growth: { from: number; to: number; share: number } | null,
  alerted: boolean,
): "alert" | "clear" | null {
  if (!growth) return null;
  const grew = growth.to - growth.from;
  if (!alerted && growth.share >= DB_GROWTH_ALERT_SHARE && grew >= DB_GROWTH_ALERT_MIN_BYTES) return "alert";
  if (alerted && growth.share < DB_GROWTH_CLEAR_SHARE) return "clear";
  return null;
}

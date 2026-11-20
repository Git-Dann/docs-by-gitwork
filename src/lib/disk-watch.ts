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

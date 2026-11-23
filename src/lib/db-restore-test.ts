/**
 * Rules for the monthly restore test of the off-site backup (CLAUDE.md §148). Pure, so tested.
 *
 * A backup nobody has restored is a hope, not a backup. Once a month the newest backup is
 * downloaded, decrypted and restored into a throwaway database on the same Postgres server, a
 * few core tables are counted against production, and the throwaway database is dropped.
 * src/server/db-restore-test.ts does the work; everything that decides something lives here.
 */

/**
 * The throwaway database. A fixed name, never derived from anything a request or the
 * environment says, and asserted to differ from the real database before anything is dropped.
 */
export const RESTORE_TEST_DB = "foundry_restore_test";

/** Tables counted in production and in the restored copy (their real Postgres names). */
export const RESTORE_CHECK_TABLES = [
  "Workspace",
  "User",
  "WorkspaceMember",
  "Client",
  "Task",
  "Document",
  "PulseScan",
  "SupportConversation",
] as const;

/** Production has moved on since the backup: allow this much difference, whichever is larger. */
export const RESTORE_COUNT_SLACK_ROWS = 200;
export const RESTORE_COUNT_SLACK_SHARE = 0.15;

/** The newest backup must be this recent, or the test fails: it would be testing an old file. */
export const RESTORE_MAX_BACKUP_AGE_MS = 3 * 86_400_000;

/** The test runs monthly; the Platform popup calls it overdue after this long without a pass. */
export const RESTORE_TEST_OVERDUE_MS = 35 * 86_400_000;

/** Free disk the restore must leave behind (the copy is about the size of the live database). */
export const RESTORE_DISK_HEADROOM_BYTES = 2 * 1024 ** 3;
export const RESTORE_DISK_MAX_USED_SHARE = 0.85;

/**
 * The URL for the throwaway database on the same server as `databaseUrl`. Throws when the live
 * database already has the throwaway's name, so the drop that ends every run can never reach it.
 */
export function restoreDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL is not a Postgres URL.");
  }
  const live = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!live) throw new Error("DATABASE_URL names no database.");
  assertThrowawayName(RESTORE_TEST_DB, live);
  url.pathname = `/${RESTORE_TEST_DB}`;
  return url.toString();
}

/** Refuses any name but the fixed throwaway, and the throwaway when it is the live database. */
export function assertThrowawayName(name: string, liveName: string): void {
  if (name !== RESTORE_TEST_DB) throw new Error(`Refusing to use "${name}": the restore test only ever uses ${RESTORE_TEST_DB}.`);
  if (name === liveName) throw new Error(`Refusing to restore: the live database is itself named ${RESTORE_TEST_DB}.`);
}

/** libpq's own variables for a URL, so a password never appears in a command line. */
export function libpqEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** The object keys in an S3 ListObjectsV2 answer. */
export function parseListedKeys(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
    out.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  return out;
}

/** Backups live one folder a month (src/lib/db-backup.ts); look in this month's and the last. */
export function backupMonthPrefixes(now: Date): string[] {
  const at = (y: number, m: number) => `foundry/db/${y}/${String(m + 1).padStart(2, "0")}/`;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return [at(y, m), m === 0 ? at(y - 1, 11) : at(y, m - 1)];
}

const KEY_RE = /^foundry\/db\/\d{4}\/\d{2}\/foundry-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z\.dump\.enc$/;

/** When a backup was made, read from its key, or null for a key that isn't one of ours. */
export function backupTimeOf(key: string): Date | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The newest of our backups among `keys` (anything else in the bucket is ignored), or null. */
export function newestBackupKey(keys: readonly string[]): string | null {
  let best: { key: string; at: number } | null = null;
  for (const key of keys) {
    const at = backupTimeOf(key)?.getTime();
    if (at == null) continue;
    if (!best || at > best.at) best = { key, at };
  }
  return best?.key ?? null;
}

export interface TableCount {
  table: string;
  /** Rows in production now, or null if it couldn't be counted. */
  live: number | null;
  /** Rows in the restored copy, or null if the table is missing there. */
  restored: number | null;
}

/** Each table that doesn't look like a faithful copy, in a sentence. Empty means it passed. */
export function countProblems(counts: readonly TableCount[]): string[] {
  const out: string[] = [];
  for (const c of counts) {
    if (c.restored == null) {
      out.push(`${c.table} is missing from the restored copy`);
      continue;
    }
    if (c.live == null) {
      out.push(`${c.table} could not be counted in production`);
      continue;
    }
    if (c.live > 0 && c.restored === 0) {
      out.push(`${c.table} restored empty (production has ${c.live})`);
      continue;
    }
    const slack = Math.max(RESTORE_COUNT_SLACK_ROWS, Math.ceil(c.live * RESTORE_COUNT_SLACK_SHARE));
    if (Math.abs(c.live - c.restored) > slack) {
      out.push(`${c.table} has ${c.restored} rows restored against ${c.live} in production`);
    }
  }
  return out;
}

/** Whether restoring a copy of the database would leave the disk safe, or why not. */
export function restoreDiskProblem(d: { freeBytes: number; totalBytes: number; databaseBytes: number | null }): string | null {
  if (d.databaseBytes == null || d.totalBytes <= 0) return "Couldn't read the disk or the database's size, so the restore was not started.";
  const freeAfter = d.freeBytes - d.databaseBytes;
  const usedAfter = 1 - freeAfter / d.totalBytes;
  if (freeAfter < RESTORE_DISK_HEADROOM_BYTES || usedAfter > RESTORE_DISK_MAX_USED_SHARE) {
    return "Not enough free disk to restore a copy of the database next to the live one.";
  }
  return null;
}

export type RestoreTestState =
  | { state: "off" }
  | { state: "misconfigured"; reason: string }
  | { state: "never" }
  | { state: "passed"; at: string }
  | { state: "failed"; at: string; lastPassed: string | null }
  | { state: "overdue"; lastPassed: string };

/** What the Platform popup says about the restore test, from the two markers it leaves. */
export function restoreTestState(input: {
  config: "off" | "misconfigured" | "on";
  reason?: string | null;
  lastOk: string | null;
  lastFailed: string | null;
  now: Date;
}): RestoreTestState {
  if (input.config === "off") return { state: "off" };
  if (input.config === "misconfigured") return { state: "misconfigured", reason: input.reason ?? "Set up wrongly" };
  const ok = input.lastOk ? Date.parse(input.lastOk) : null;
  const failed = input.lastFailed ? Date.parse(input.lastFailed) : null;
  if (failed != null && (ok == null || failed > ok)) return { state: "failed", at: input.lastFailed!, lastPassed: input.lastOk };
  if (ok == null) return { state: "never" };
  if (input.now.getTime() - ok > RESTORE_TEST_OVERDUE_MS) return { state: "overdue", lastPassed: input.lastOk! };
  return { state: "passed", at: input.lastOk! };
}

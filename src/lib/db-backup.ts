/**
 * Rules for the off-site database backup (CLAUDE.md §144). Pure, so they are tested.
 *
 * File format (`.dump.enc`): the 4 bytes "FDB1", a 12-byte IV, the AES-256-GCM ciphertext of a
 * `pg_dump -Fc` file, then the 16-byte GCM tag. `scripts/decrypt-backup.mjs` reverses it.
 */

export const BACKUP_MAGIC = "FDB1";
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;

/** Above this the backup is refused with an alert rather than buffered into memory. */
export const BACKUP_MAX_BYTES = 1_000_000_000;

/** Parameters libpq (pg_dump) understands from a Prisma URL. Prisma's own (`schema`,
 *  `connection_limit`, `pgbouncer`…) make pg_dump refuse the URL, so everything else goes. */
const LIBPQ_PARAMS = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "connect_timeout", "application_name"]);

export function pgDumpUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL is not a Postgres URL.");
  }
  for (const key of [...url.searchParams.keys()]) {
    if (!LIBPQ_PARAMS.has(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** The 32-byte key from BACKUP_ENCRYPTION_KEY (base64), or a sentence saying what's wrong. */
export function parseBackupKey(raw: string | undefined): { key: Buffer } | { error: string } {
  const v = raw?.trim();
  if (!v) return { error: "BACKUP_ENCRYPTION_KEY is not set." };
  const key = Buffer.from(v, "base64");
  if (key.length !== 32) {
    return { error: "BACKUP_ENCRYPTION_KEY must be 32 random bytes, base64 (openssl rand -base64 32)." };
  }
  return { key };
}

/** `foundry/db/2026/11/foundry-2026-11-20T0300Z.dump.enc`: sorts by date, one folder a month. */
export function backupObjectKey(at: Date): string {
  const iso = at.toISOString();
  const stamp = `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
  return `foundry/db/${iso.slice(0, 4)}/${iso.slice(5, 7)}/foundry-${stamp}.dump.enc`;
}

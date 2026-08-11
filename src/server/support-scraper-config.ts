/**
 * support-scraper-config.ts — encryption helpers for `AccountConnection.scraperConfig`,
 * plus the one sanctioned way to build a channel SyncContext from a connection row.
 *
 * Deliberately DEPENDENCY-LIGHT: it imports only `@/lib/encryption` and a type. These
 * helpers were previously buried in `support.ts`, whose import chain reaches NextAuth and
 * Prisma — which meant the decrypt step could not be unit-tested, and a path that skipped
 * it (the daily sync cron) went unnoticed for months. Keep this module free of heavy
 * imports so the guard tests can load it.
 *
 * `support.ts` re-exports the crypto helpers, so existing call sites are unchanged.
 */

import { encrypt, decrypt } from "@/lib/encryption";
import type { SyncContext } from "@/server/support-channels/types";

/** Config keys persisted encrypted. Anything here reaches an adapter as `enc:…` until decrypted. */
export const SENSITIVE_SCRAPER_KEYS = [
  "botToken",
  "serviceAccountJson",
  "apiToken",
  "webhookToken",
  "password",
];

/**
 * Encrypts sensitive values in a scraperConfig object using AES-256-GCM.
 * No-ops when ENCRYPTION_KEY is not set, so existing deployments are unaffected
 * until the key is provisioned.
 */
export function encryptScraperConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!process.env.ENCRYPTION_KEY) return config;
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) =>
      SENSITIVE_SCRAPER_KEYS.includes(k) && typeof v === "string" && v && !v.startsWith("enc:")
        ? [k, `enc:${encrypt(v)}`]
        : [k, v],
    ),
  );
}

/**
 * Decrypts `enc:…` values in a scraperConfig object. Plain-text values (legacy or
 * unset ENCRYPTION_KEY) are returned as-is.
 */
export function decryptScraperConfig(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!config) return null;
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => {
      if (typeof v === "string" && v.startsWith("enc:")) {
        try {
          return [k, decrypt(v.slice(4))];
        } catch {
          return [k, ""];  // decryption failure → empty (won't expose ciphertext)
        }
      }
      return [k, v];
    }),
  );
}

/**
 * The ONLY sanctioned way to build a SyncContext from a connection row.
 *
 * Adapters need `scraperConfig` secrets in the clear. A context built straight from the
 * Prisma row hands them `enc:…` literals instead, so authentication fails and the sync
 * silently no-ops. That is exactly what the daily cron did — automated sync was dead for
 * every IMAP/Discord/app-reviews/analytics connector while manual "Sync now" worked,
 * because that path happened to decrypt.
 *
 * Route every context through here so the decrypt cannot be forgotten again.
 */
export function toSyncContext(
  conn: SyncContext["connection"] & { client: SyncContext["client"] },
  workspace: SyncContext["workspace"],
): SyncContext {
  return {
    connection: {
      ...conn,
      scraperConfig: decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null),
    },
    client: conn.client,
    workspace,
  };
}

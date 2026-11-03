/**
 * Secrets stored on the Workspace row — AI keys, the email API key, the external API
 * key, the Google service-account JSON.
 *
 * These were plain text in the database. Phase 0 of docs/multi-tenant-roadmap.md
 * encrypts them, and does it without a migration: new values are written encrypted,
 * and every reader goes through `readSecret`, which accepts both an encrypted value
 * and a legacy plain one. So nothing breaks the day this ships, and each secret
 * becomes encrypted the next time it is saved.
 *
 * Same scheme as the SMTP password (src/server/smtp-password.ts) and the Slack token,
 * with one difference that matters: that helper treats any value starting with "{" as
 * encrypted, which would misread a Google service-account file — plain JSON that also
 * starts with "{". Here an encrypted value is recognised by its exact envelope shape.
 */

import { decrypt, encrypt } from "@/lib/encryption";

/** Does `stored` look like our cipher envelope ({ v: 1, iv, ct, tag })? */
export function isEncryptedSecret(stored: string): boolean {
  if (!stored.startsWith("{")) return false;
  try {
    const env = JSON.parse(stored) as Record<string, unknown>;
    return (
      env.v === 1 &&
      typeof env.iv === "string" &&
      typeof env.ct === "string" &&
      typeof env.tag === "string" &&
      Object.keys(env).length === 4
    );
  } catch {
    return false;
  }
}

/**
 * Value to WRITE. Encrypted when ENCRYPTION_KEY is set (it is in production). Without
 * it — a local dev machine — the value is stored as given rather than refusing the
 * save, and readSecret reads it back the same way.
 */
export function storeSecret(plain: string): string {
  if (!process.env.ENCRYPTION_KEY) {
    console.warn("[stored-secret] ENCRYPTION_KEY is not set; storing a secret unencrypted");
    return plain;
  }
  return encrypt(plain);
}

/**
 * Value to USE. Legacy plain values pass through unchanged. A value that is encrypted
 * but can't be decrypted (the key was rotated or is missing) reads as "not set" and
 * says so in the log: sending a cipher envelope to an API as if it were a key would
 * fail anyway, and less legibly.
 */
export function readSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedSecret(stored)) return stored;
  try {
    return decrypt(stored);
  } catch (err) {
    console.error("[stored-secret] could not decrypt a stored secret; treating it as not set", err);
    return null;
  }
}

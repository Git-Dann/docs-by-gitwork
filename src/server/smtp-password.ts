import { decrypt, encrypt } from "@/lib/encryption";

/**
 * The workspace SMTP password is stored encrypted. Rows saved before that change hold
 * it in plain text, so a value that is not a cipher envelope is read as-is rather than
 * failing every send until someone re-enters it.
 */
export function storeSmtpPassword(plain: string): string {
  return encrypt(plain);
}

export function readSmtpPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith("{")) return stored;
  return decrypt(stored);
}

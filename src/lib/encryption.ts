import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Key is sourced from process.env.ENCRYPTION_KEY: a 32-byte secret
// encoded as base64. Generate with:  openssl rand -base64 32
//
// Ciphertext is persisted as a JSON envelope so we can rotate keys/algorithms in
// future without a destructive migration. Shape:
//   { v: 1, iv: base64, ct: base64, tag: base64 }

const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard

type Envelope = {
  v: 1;
  iv: string;
  ct: string;
  tag: string;
};

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add to .env.local / Vercel.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}). Regenerate with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = buf;
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decrypt(ciphertextJson: string): string {
  const key = loadKey();
  let env: Envelope;
  try {
    env = JSON.parse(ciphertextJson) as Envelope;
  } catch {
    throw new Error("Cipher envelope is not valid JSON");
  }
  if (env.v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported cipher envelope version ${env.v}`);
  }
  const iv = Buffer.from(env.iv, "base64");
  const ct = Buffer.from(env.ct, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Convenience: encrypt only when a plaintext is provided. */
export function encryptNullable(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const trimmed = plaintext.trim();
  if (!trimmed) return null;
  return encrypt(trimmed);
}

/** Convenience: decrypt only when a ciphertext is present. */
export function decryptNullable(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  return decrypt(ciphertext);
}

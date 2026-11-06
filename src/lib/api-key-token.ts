/**
 * Workspace API keys: the token format (multi-tenant Phase 2).
 *
 *   fwk_<keyId>_<secret>_<signature>
 *
 * `signature` is an HMAC-SHA256 of `<keyId>_<secret>` under AUTH_SECRET. The middleware runs at
 * the edge and cannot read the database, so it checks the signature: a made-up or mangled key
 * is refused before any route runs. The route then checks the key in the database on every
 * request (exists, not revoked, its creator still an active member of its workspace), because a
 * signature cannot say a key was revoked.
 *
 * Only a SHA-256 of the whole token is stored. WebCrypto only, so this runs at the edge and in
 * Node alike.
 */

export const API_KEY_PREFIX = "fwk_";

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(body))).slice(0, 32);
}

/** Constant-time string comparison. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function looksLikeApiKey(token: string | null | undefined): token is string {
  return typeof token === "string" && token.startsWith(API_KEY_PREFIX);
}

/** Split a token into its parts, or null when it is not one of ours. */
export function parseApiKey(token: string): { keyId: string; secret: string; signature: string } | null {
  if (!looksLikeApiKey(token)) return null;
  const parts = token.slice(API_KEY_PREFIX.length).split("_");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9-]{8,}$/.test(p))) return null;
  const [keyId, secret, signature] = parts;
  return { keyId, secret, signature };
}

/** A new token for `keyId`. The caller stores `sha256` of it and shows it to the person once. */
export async function mintApiKey(keyId: string, secretValue: string): Promise<string> {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const secret = base64url(randomBytes).replace(/_/g, "-");
  const signature = (await hmac(secretValue, `${keyId}_${secret}`)).replace(/_/g, "-");
  return `${API_KEY_PREFIX}${keyId}_${secret}_${signature}`;
}

/** True when the token was signed by us. Says nothing about whether it has been revoked. */
export async function hasValidApiKeySignature(token: string, secretValue: string): Promise<boolean> {
  const parsed = parseApiKey(token);
  if (!parsed) return false;
  const expected = (await hmac(secretValue, `${parsed.keyId}_${parsed.secret}`)).replace(/_/g, "-");
  return sameString(expected, parsed.signature);
}

/** The stored form: SHA-256 of the whole token, hex. */
export async function hashApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the request carries a workspace API key as its bearer token. */
export function presentsApiKey(req: Request): boolean {
  const h = req.headers.get("authorization");
  return looksLikeApiKey(h?.startsWith("Bearer ") ? h.slice(7).trim() : null);
}

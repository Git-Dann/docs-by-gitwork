// Tamper evidence — the difference between a PDF someone can edit and an attestation.
//
// Two separable properties, and conflating them is the usual mistake:
//
//   digest — a SHA-256 over a canonical serialisation of the payload. Proves the
//            certificate's CONTENTS have not been altered. Anyone can recompute it from
//            what is printed on the certificate; it needs no secret and no trust in us.
//
//   seal   — an HMAC-SHA-256 over that same canonical form, keyed on ASSAY_SIGNING_SECRET.
//            Proves the attestation was ISSUED BY US and not fabricated by someone who
//            read the format. Requires the secret, so only the issuer can produce one.
//
// A digest alone is worthless against forgery: an attacker who changes the contents simply
// recomputes it. That is exactly why the seal exists, and why the certificate must render
// its absence honestly rather than showing a reassuring checkmark.
//
// ── The honesty rule ────────────────────────────────────────────────────────────────
// With no secret configured we emit `seal: null` and the certificate says UNSEALED. We do
// NOT fall back to signing with a default/derived key. A seal that anyone can reproduce
// looks identical to a real one to every reader while proving nothing, which is worse than
// visibly having none — it is the "we couldn't look, so we said it was fine" failure from
// CLAUDE.md §35 wearing a padlock icon.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AttestationPayload } from "./types";

/**
 * Deterministic serialisation. `JSON.stringify` preserves insertion order, so two payloads
 * that are equal as values but were built in a different order would otherwise digest
 * differently and every verification would fail. Keys are sorted recursively.
 *
 * Arrays keep their order — it is meaningful (the caller sorts clauses by id before
 * building the payload, and re-sorting here would hide a caller that forgot to).
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` members are dropped by JSON.stringify, so drop them here too or the
    // canonical form and a round-tripped payload disagree.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

export function computeDigest(payload: AttestationPayload): string {
  return createHash("sha256").update(canonicalise(payload), "utf8").digest("hex");
}

function signingSecret(): string | null {
  const secret = process.env.ASSAY_SIGNING_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/** True when this deployment can produce verifiable seals. Surfaced in the UI. */
export function canSeal(): boolean {
  return signingSecret() !== null;
}

/** HMAC seal, or null when no secret is configured. Never a fabricated substitute. */
export function computeSeal(payload: AttestationPayload): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(canonicalise(payload), "utf8").digest("hex");
}

export type SealVerdict = "SEALED" | "UNSEALED" | "TAMPERED" | "UNVERIFIABLE";

/**
 * Re-derive the digest and seal from a payload and compare against what was stored.
 *
 * `UNVERIFIABLE` (a seal exists but this deployment has no secret to check it with) is
 * kept distinct from `TAMPERED`. Reporting a rotated or missing key as tampering would
 * cry forgery over a config change — the same "we couldn't look ≠ it isn't there"
 * distinction the digest comment above turns on.
 */
export function verifyAttestation(
  payload: AttestationPayload,
  storedDigest: string,
  storedSeal: string | null,
): { verdict: SealVerdict; digestMatches: boolean } {
  const digestMatches = safeEqualHex(computeDigest(payload), storedDigest);
  if (!digestMatches) return { verdict: "TAMPERED", digestMatches: false };
  if (!storedSeal) return { verdict: "UNSEALED", digestMatches: true };
  const expected = computeSeal(payload);
  if (!expected) return { verdict: "UNVERIFIABLE", digestMatches: true };
  return { verdict: safeEqualHex(expected, storedSeal) ? "SEALED" : "TAMPERED", digestMatches: true };
}

/** Constant-time hex compare. Length mismatch short-circuits — that leaks nothing useful. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    // Non-hex input (a truncated or hand-edited value) — not equal, and not an error worth
    // throwing to a public page.
    return false;
  }
}

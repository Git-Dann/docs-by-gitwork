/**
 * Named intake keys — one credential per integrator, so a client can have several
 * systems pushing and you can revoke one without breaking the others.
 *
 * ── Why this layers instead of replacing ────────────────────────────────────
 * `ClientWiki.courseIngestToken` is live (Wedge's golf-course feed authenticates
 * with it) and is resolved at eight separate call sites across wiki.ts. Rewriting
 * all of them to understand multiple credentials would put a working client
 * integration at risk for a feature most clients never need.
 *
 * So a presented credential is translated to the wiki's canonical token ONCE, at
 * the edge of the public routes (`resolvePresentedIntakeToken`), and every lookup
 * downstream stays exactly as it was. The legacy token keeps working untouched;
 * named keys are strictly additive.
 *
 * Only a SHA-256 hash is stored. The plaintext is returned once at mint and is
 * unrecoverable after — a lost key is revoked and replaced, never recovered.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** Recognisable, greppable prefix so a leaked key is identifiable in a log. */
const KEY_PREFIX = "fdy_ik_";
const DISPLAY_CHARS = KEY_PREFIX.length + 8;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface IntakeKeySummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function toSummary(row: {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): IntakeKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Mint a named key. Returns the plaintext ONCE — it is not stored. */
export async function mintIntakeKey(
  clientId: string,
  name: string,
  createdById?: string | null,
): Promise<{ key: string; summary: IntakeKeySummary }> {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await prisma.clientIntakeKey.create({
    data: {
      clientId,
      name: name.trim() || "Client system",
      keyHash: hashKey(key),
      prefix: key.slice(0, DISPLAY_CHARS),
      createdById: createdById ?? null,
    },
  });
  return { key, summary: toSummary(row) };
}

export async function listIntakeKeys(clientId: string): Promise<IntakeKeySummary[]> {
  const rows = await prisma.clientIntakeKey.findMany({
    where: { clientId },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toSummary);
}

/** Revoke without deleting, so who-had-access-when survives. Scoped to the client. */
export async function revokeIntakeKey(clientId: string, keyId: string): Promise<boolean> {
  const result = await prisma.clientIntakeKey.updateMany({
    where: { id: keyId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Translate whatever credential a caller presented into the wiki's canonical
 * intake token, so every existing downstream lookup works unchanged.
 *
 * - A legacy `courseIngestToken` passes straight through (it IS the canonical one).
 * - A named key resolves to its client's canonical token.
 * - Anything else returns null, and the caller's existing "invalid token" path
 *   handles it — a revoked key is indistinguishable from an unknown one, so a
 *   probe can't learn whether a key merely expired.
 *
 * A named key whose client has no canonical token yet returns null rather than
 * minting one: the API is off until someone enables it, and a key must not be
 * able to switch it on.
 */
export async function resolvePresentedIntakeToken(presented: string): Promise<string | null> {
  const raw = presented?.trim();
  if (!raw) return null;
  // Not our prefix → assume it's the legacy token and leave it alone. Cheapest
  // path, and it keeps the existing behaviour byte-identical.
  if (!raw.startsWith(KEY_PREFIX)) return raw;

  const key = await prisma.clientIntakeKey.findUnique({
    where: { keyHash: hashKey(raw) },
    select: {
      id: true,
      revokedAt: true,
      client: { select: { wiki: { select: { courseIngestToken: true } } } },
    },
  });
  if (!key || key.revokedAt) return null;
  const canonical = key.client.wiki?.courseIngestToken;
  if (!canonical) return null;

  // Best-effort usage stamp — never fail a valid request because this write did.
  void prisma.clientIntakeKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return canonical;
}

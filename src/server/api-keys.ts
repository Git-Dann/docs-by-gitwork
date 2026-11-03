/**
 * Workspace API keys (multi-tenant Phase 2). Admins create named keys for their own workspace;
 * a key acts as the person who created it, inside that workspace only, and is re-checked on
 * every request — so archiving its creator, or moving them out of the workspace, kills it.
 *
 * ⚠️ A key that fails any check is a REFUSAL (RevokedAccessError), never "no identity". No
 * identity is how the trusted env `API_KEY` is represented, and a broken key must never be
 * promoted to that.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hasValidApiKeySignature, hashApiKey, mintApiKey, parseApiKey } from "@/lib/api-key-token";
import { findActiveMembershipIn } from "@/server/auth/home-membership";

export const MAX_API_KEYS_PER_WORKSPACE = 25;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured, so API keys cannot be issued.");
  return secret;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  preview: string;
  createdById: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function summary(row: {
  id: string;
  name: string;
  preview: string;
  createdById: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    preview: row.preview,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(workspaceId: string): Promise<ApiKeySummary[]> {
  const rows = await prisma.workspaceApiKey.findMany({
    where: { workspaceId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(summary);
}

/** Create a key. Returns the token, which is never readable again. */
export async function createApiKey(input: {
  workspaceId: string;
  createdById: string;
  name: string;
}): Promise<{ key: ApiKeySummary; token: string }> {
  const live = await prisma.workspaceApiKey.count({ where: { workspaceId: input.workspaceId, revokedAt: null } });
  if (live >= MAX_API_KEYS_PER_WORKSPACE) {
    throw Object.assign(new Error(`A workspace can have at most ${MAX_API_KEYS_PER_WORKSPACE} keys. Revoke one first.`), {
      status: 400,
    });
  }
  const id = `k${randomBytes(12).toString("hex")}`;
  const token = await mintApiKey(id, signingSecret());
  const row = await prisma.workspaceApiKey.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      createdById: input.createdById,
      name: input.name.trim().slice(0, 80),
      tokenHash: await hashApiKey(token),
      preview: token.slice(0, 16),
    },
  });
  return { key: summary(row), token };
}

/** Revoke a key in this workspace. False when there is no such live key here. */
export async function revokeApiKey(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.workspaceApiKey.updateMany({
    where: { id, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}

/**
 * Who a presented key acts as. Null means "refuse" for EVERY failure: bad signature, unknown,
 * revoked, or its creator no longer an active member of its workspace.
 */
export async function resolveApiKey(
  token: string,
): Promise<{ keyId: string; userId: string; workspaceId: string } | null> {
  const parsed = parseApiKey(token);
  if (!parsed) return null;
  if (!(await hasValidApiKeySignature(token, signingSecret()))) return null;
  const row = await prisma.workspaceApiKey.findFirst({
    where: { id: parsed.keyId, tokenHash: await hashApiKey(token), revokedAt: null },
    select: { id: true, workspaceId: true, createdById: true, lastUsedAt: true },
  });
  if (!row) return null;
  if (!(await findActiveMembershipIn(row.createdById, row.workspaceId))) return null;
  // Best effort, at most once a minute per key.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    prisma.workspaceApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { keyId: row.id, userId: row.createdById, workspaceId: row.workspaceId };
}

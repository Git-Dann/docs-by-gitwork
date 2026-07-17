import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterContent, StarterStatus, StarterType } from "@/server/starters";

// ── Starter version history ─────────────────────────────────────────────────────
// Point-in-time snapshots of a starter's restorable fields. A snapshot is captured automatically
// before each content-changing save (see updateStarter) and before a restore, so any edit is
// reversible. Mirrors the Docs DocumentVersion pattern, plus a restore the Docs one lacks.

export interface StarterSnapshot {
  name: string;
  summary: string;
  description: string | null;
  tags: string[];
  type: StarterType;
  status: StarterStatus;
  content: StarterContent | null;
}

export interface StarterVersionListItem {
  id: string;
  version: number;
  changelog: string | null;
  createdAt: string;
}

export interface StarterVersionRecord extends StarterVersionListItem {
  snapshot: StarterSnapshot;
}

/** Structural row shape — accepts either a Prisma starter row or the in-memory equivalent. */
type SnapshotSource = {
  name: string;
  summary: string;
  description: string | null;
  tags: string[];
  type: string;
  status: string;
  content: unknown;
};

export function starterToSnapshot(row: SnapshotSource): StarterSnapshot {
  const content = row.content && typeof row.content === "object" ? (row.content as StarterContent) : null;
  return {
    name: row.name,
    summary: row.summary,
    description: row.description ?? null,
    tags: row.tags,
    type: row.type as StarterType,
    status: row.status as StarterStatus,
    content,
  };
}

type Db = typeof prisma | Prisma.TransactionClient;

/** Append a version row (next sequential number) capturing the given snapshot. */
export async function createStarterVersion(
  db: Db,
  starterId: string,
  snapshot: StarterSnapshot,
  changelog: string | null,
  createdById: string | null,
): Promise<void> {
  const last = await db.starterVersion.findFirst({
    where: { starterId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await db.starterVersion.create({
    data: {
      starterId,
      version: (last?.version ?? 0) + 1,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      changelog,
      createdById,
    },
  });
}

export async function listStarterVersions(starterId: string): Promise<StarterVersionListItem[]> {
  const rows = await prisma.starterVersion.findMany({
    where: { starterId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, changelog: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, version: r.version, changelog: r.changelog, createdAt: r.createdAt.toISOString() }));
}

export async function getStarterVersion(starterId: string, versionId: string): Promise<StarterVersionRecord | null> {
  const row = await prisma.starterVersion.findFirst({ where: { id: versionId, starterId } });
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    changelog: row.changelog,
    createdAt: row.createdAt.toISOString(),
    snapshot: row.snapshot as unknown as StarterSnapshot,
  };
}

/**
 * Restore a starter to a past version. Snapshots the current state first (so restore is itself
 * reversible), then writes the version's snapshot back onto the live starter. Returns false if the
 * starter or version can't be found in this workspace.
 */
export async function restoreStarterVersion(starterId: string, versionId: string, actorId: string | null): Promise<boolean> {
  const target = await prisma.starterVersion.findFirst({ where: { id: versionId, starterId } });
  if (!target) return false;
  const current = await prisma.starter.findUnique({ where: { id: starterId } });
  if (!current) return false;
  const snap = target.snapshot as unknown as StarterSnapshot;
  await prisma.$transaction(async (tx) => {
    await createStarterVersion(tx, starterId, starterToSnapshot(current), `Before restoring v${target.version}`, actorId);
    await tx.starter.update({
      where: { id: starterId },
      data: {
        name: snap.name,
        summary: snap.summary,
        description: snap.description,
        tags: snap.tags,
        type: snap.type as StarterType,
        status: snap.status as StarterStatus,
        content: (snap.content ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });
  });
  return true;
}

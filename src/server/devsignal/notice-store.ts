import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_NOTICE_CONTENT,
  normalizeNoticeContent,
  type NoticeContent,
} from "@/lib/devsignal/processing-notice";

/**
 * DB-backed access to the editable consent/processing notice. Versioned like the
 * pipeline config: editing publishes a new active version and demotes the old,
 * so a consent record's stamped version always resolves to what was agreed.
 * Falls back to the in-code DEFAULT_NOTICE_CONTENT when nothing is stored yet.
 */

export const DEFAULT_NOTICE_VERSION = "v1";

export interface ActiveNotice {
  version: string;
  content: NoticeContent;
}

/** Seed the default notice on boot. update:{} so in-app edits survive re-boot. */
export async function seedNotice(workspaceId: string): Promise<void> {
  await prisma.devSignalNotice.upsert({
    where: { workspaceId_version: { workspaceId, version: DEFAULT_NOTICE_VERSION } },
    update: {},
    create: {
      workspaceId,
      version: DEFAULT_NOTICE_VERSION,
      isActive: true,
      content: DEFAULT_NOTICE_CONTENT as unknown as Prisma.InputJsonValue,
      publishedAt: new Date(),
    },
  });
}

/** The active notice (or the in-code default if none is stored). */
export async function getActiveNotice(workspaceId: string): Promise<ActiveNotice> {
  const row = await prisma.devSignalNotice.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { version: DEFAULT_NOTICE_VERSION, content: DEFAULT_NOTICE_CONTENT };
  return { version: row.version, content: normalizeNoticeContent(row.content) };
}

function bumpVersion(version: string): string {
  const m = /^v(\d+)$/.exec(version);
  return m ? `v${Number(m[1]) + 1}` : `${version}-2`;
}

/**
 * Publish an edited notice as a NEW active version (the prior active is demoted).
 * Historical consent records keep pointing at the version they stamped.
 */
export async function updateNotice(
  workspaceId: string,
  content: NoticeContent,
  createdBy?: string | null,
): Promise<ActiveNotice> {
  const current = await prisma.devSignalNotice.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { version: true },
  });
  const nextVersion = bumpVersion(current?.version ?? DEFAULT_NOTICE_VERSION);
  const safe = normalizeNoticeContent(content);

  await prisma.$transaction([
    prisma.devSignalNotice.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } }),
    prisma.devSignalNotice.create({
      data: {
        workspaceId,
        version: nextVersion,
        isActive: true,
        content: safe as unknown as Prisma.InputJsonValue,
        createdBy: createdBy ?? null,
        publishedAt: new Date(),
      },
    }),
  ]);

  return { version: nextVersion, content: safe };
}

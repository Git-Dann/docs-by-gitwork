import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseOverrides, type GuidelineOverrides } from "@/lib/guidelines/content";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { assertAtLeastAdmin } from "@/server/auth/effective-user";

/** The workspace's text edits to the brand guidelines, cleaned of anything stale. */
export async function getGuidelineOverrides(workspaceId: string): Promise<GuidelineOverrides> {
  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { guidelinesOverrides: true },
  });
  return parseOverrides(row?.guidelinesOverrides);
}

/**
 * Replace the edits wholesale. Admins only: the guidelines are what everyone else copies from,
 * so a change here changes every document made after it.
 */
export async function setGuidelineOverrides(
  user: EffectiveUser,
  raw: unknown,
): Promise<GuidelineOverrides> {
  assertAtLeastAdmin(user);
  const overrides = parseOverrides(raw);
  await prisma.workspace.update({
    where: { id: user.workspaceId },
    // Every edit cleared → back to null, so "no edits" has one representation.
    data: { guidelinesOverrides: Object.keys(overrides).length ? overrides : Prisma.DbNull },
  });
  return overrides;
}

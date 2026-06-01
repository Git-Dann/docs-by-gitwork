// Client timeline — public Gantt share management + the public (no-auth) read.
//
// The public timeline is client-facing: feature blocks + task names + progress
// only. No assignees, notes, priorities, or internal status chatter.

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import type {
  TimelineShareDTO,
  PublicTimelineDTO,
  PublicTimelineBlock,
} from "@/types/tasks";

function mintToken(): string {
  return randomBytes(18).toString("base64url");
}

function shareDTO(client: {
  timelineShareToken: string | null;
  timelineShareEnabled: boolean;
}): TimelineShareDTO {
  return {
    enabled: client.timelineShareEnabled && Boolean(client.timelineShareToken),
    token: client.timelineShareToken,
    url: client.timelineShareToken ? `/timeline/${client.timelineShareToken}` : null,
  };
}

export async function getTimelineShare(
  user: EffectiveUser,
  clientId: string,
): Promise<TimelineShareDTO> {
  await assertClientInScope(user, clientId);
  const client = await prisma.workspaceClient.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { timelineShareToken: true, timelineShareEnabled: true },
  });
  if (!client) throw new ForbiddenError("Client not found");
  return shareDTO(client);
}

export async function setTimelineShare(
  user: EffectiveUser,
  clientId: string,
  enabled: boolean,
): Promise<TimelineShareDTO> {
  await assertClientInScope(user, clientId);
  const client = await prisma.workspaceClient.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { timelineShareToken: true },
  });
  if (!client) throw new ForbiddenError("Client not found");

  // Mint a token on first enable; keep it across toggles so the URL is stable.
  const nextToken = client.timelineShareToken ?? (enabled ? mintToken() : null);
  const updated = await prisma.workspaceClient.update({
    where: { id: clientId },
    data: { timelineShareEnabled: enabled, timelineShareToken: nextToken },
    select: { timelineShareToken: true, timelineShareEnabled: true },
  });
  return shareDTO(updated);
}

/** Public read — no auth. Returns null when the token is unknown or sharing is off. */
export async function getPublicTimeline(shareToken: string): Promise<PublicTimelineDTO | null> {
  const client = await prisma.workspaceClient.findFirst({
    where: { timelineShareToken: shareToken, timelineShareEnabled: true },
    select: { id: true, name: true },
  });
  if (!client) return null;

  const blocks = await prisma.featureBlock.findMany({
    where: { clientId: client.id },
    orderBy: [{ orderKey: "asc" }, { startDate: "asc" }],
    include: {
      tasks: { select: { title: true, status: true }, orderBy: { orderKey: "asc" } },
    },
  });

  const publicBlocks: PublicTimelineBlock[] = blocks.map((b) => {
    const taskCount = b.tasks.length;
    const doneCount = b.tasks.filter((t) => t.status === "DONE").length;
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      color: b.color,
      progress: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
      tasks: b.tasks.map((t) => ({ title: t.title, done: t.status === "DONE" })),
    };
  });

  return {
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    blocks: publicBlocks,
  };
}

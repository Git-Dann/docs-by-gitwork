// Workspace-level settings for the Backstage availability digest (the combined
// leave + absence morning Slack post). The channel is read by the digest cron.

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import type { EffectiveUser } from "@/server/auth/effective-user";

export type AvailabilitySettings = {
  digestChannelId: string | null;
  digestChannelName: string | null;
};

export async function getAvailabilitySettings(user: EffectiveUser): Promise<AvailabilitySettings> {
  await ensureBaseRecords();
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { availabilityDigestChannelId: true, availabilityDigestChannelName: true },
  });
  return {
    digestChannelId: ws?.availabilityDigestChannelId ?? null,
    digestChannelName: ws?.availabilityDigestChannelName ?? null,
  };
}

export async function setAvailabilityDigestChannel(
  user: EffectiveUser,
  channelId: string | null,
  channelName: string | null,
): Promise<AvailabilitySettings> {
  await ensureBaseRecords();
  const ws = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: {
      availabilityDigestChannelId: channelId,
      availabilityDigestChannelName: channelId ? channelName : null,
    },
    select: { availabilityDigestChannelId: true, availabilityDigestChannelName: true },
  });
  return {
    digestChannelId: ws.availabilityDigestChannelId,
    digestChannelName: ws.availabilityDigestChannelName,
  };
}

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";

export const SLACK_UPDATE_COOLDOWN_SECONDS = 60;

const SLACK_UPDATE_COOLDOWN_MS = SLACK_UPDATE_COOLDOWN_SECONDS * 1000;

class SlackCooldownError extends Error {
  status = 429;

  constructor(label: string, retryAfterSeconds: number) {
    super(
      `${label} was just sent. Please wait ${retryAfterSeconds}s before sending another update.`,
    );
    this.name = "SlackCooldownError";
  }
}

function cutoff(): Date {
  return new Date(Date.now() - SLACK_UPDATE_COOLDOWN_MS);
}

function retryAfterSeconds(createdAt: Date): number {
  return Math.max(1, Math.ceil((createdAt.getTime() + SLACK_UPDATE_COOLDOWN_MS - Date.now()) / 1000));
}

export async function assertSlackUpdateLogCooldown(
  user: EffectiveUser,
  input: { kind: "PROJECT_UPDATE" | "BROADCAST"; clientId: string | null; label: string },
): Promise<void> {
  const recent = await prisma.slackUpdateLog.findFirst({
    where: {
      workspaceId: user.workspaceId,
      userId: user.id,
      kind: input.kind,
      clientId: input.clientId,
      createdAt: { gte: cutoff() },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) throw new SlackCooldownError(input.label, retryAfterSeconds(recent.createdAt));
}

export async function assertTaskSlackPushCooldown(
  user: EffectiveUser,
  taskId: string,
): Promise<void> {
  const recent = await prisma.slackMessageRef.findFirst({
    where: {
      workspaceId: user.workspaceId,
      postedById: user.id,
      taskId,
      kind: "TEST_PUSH",
      createdAt: { gte: cutoff() },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) throw new SlackCooldownError("Task push", retryAfterSeconds(recent.createdAt));
}

export async function assertDailyUpdateCooldown(
  user: EffectiveUser,
  input: { phase: "AM" | "PM"; workDate: Date },
): Promise<void> {
  const recent = await prisma.dailyUpdate.findUnique({
    where: { userId_workDate: { userId: user.id, workDate: input.workDate } },
    select: { amPushedAt: true, pmPushedAt: true },
  });
  const pushedAt = input.phase === "AM" ? recent?.amPushedAt : recent?.pmPushedAt;
  if (pushedAt && pushedAt >= cutoff()) {
    throw new SlackCooldownError(`${input.phase} standup`, retryAfterSeconds(pushedAt));
  }
}

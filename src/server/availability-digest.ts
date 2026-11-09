// Availability digest — a once-a-morning Slack post of who's on approved LEAVE
// (holidays). Absences are deliberately NOT included here: they get their own
// instant post at mark time, so listing them again in the digest just doubled up.
// Runs each weekday morning: Monday posts a week roll-up, Tue–Fri "on leave today".
// Silent when nobody's on leave. Holidays surface here when ACTIVE (no post on booking).

import { prisma } from "@/lib/prisma";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import {
  formatAvailabilityDigest,
  mondayOf,
  type DigestMode,
} from "@/lib/availability-digest-format";

const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

// Compose the digest text for a workspace + mode. Returns null when nobody's on leave.
// The wording lives in src/lib/availability-digest-format.ts (pure and tested).
export async function buildAvailabilityDigest(
  workspaceId: string,
  mode: DigestMode,
  ref = new Date(),
): Promise<string | null> {
  const today = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const monday = mondayOf(today);
  const rangeStart = mode === "weekly" ? monday : today;
  // Mon–Fri: the weekly post is about the working week, and says so in its heading.
  const rangeEnd = mode === "weekly" ? new Date(monday.getTime() + 4 * 86_400_000) : today;

  const leave = await prisma.leaveRequest.findMany({
    where: {
      workspaceId,
      status: "APPROVED",
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
      user: { email: { not: BOOTSTRAP_USER_EMAIL } },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startDate: "asc" },
  });

  return formatAvailabilityDigest(
    leave.map((l) => ({
      name: l.user.name?.trim() ? l.user.name : l.user.email,
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      halfDayStart: l.halfDayStart,
      halfDayEnd: l.halfDayEnd,
    })),
    mode,
    today,
  );
}

// Cron entry: post the digest for every workspace that has a digest channel
// configured. Monday → weekly roll-up; other weekdays → today; weekends skipped.
export async function runAvailabilityDigest(ref = new Date()): Promise<{ posted: number }> {
  const dow = ref.getUTCDay();
  if (dow === 0 || dow === 6) return { posted: 0 }; // no weekend posts
  const mode: DigestMode = dow === 1 ? "weekly" : "daily";

  const workspaces = await prisma.workspace.findMany({
    where: { availabilityDigestChannelId: { not: null } },
    select: {
      id: true,
      availabilityDigestChannelId: true,
      slackBotToken: true,
      slackBotTokenEncrypted: true,
    },
  });

  let posted = 0;
  for (const ws of workspaces) {
    const token = getSlackBotToken(ws);
    if (!token || !ws.availabilityDigestChannelId) continue;
    const text = await buildAvailabilityDigest(ws.id, mode, ref);
    if (!text) continue;
    try {
      const res = await postMessage(token, { channel: ws.availabilityDigestChannelId, text });
      if (res.ok) posted += 1;
    } catch {
      // Skip this workspace on a network error; next run retries.
    }
  }
  return { posted };
}

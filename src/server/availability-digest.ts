// Availability digest — ONE combined Slack post covering both approved leave
// (holidays) and absences, so we never fan out separate "holiday" and "absence"
// updates. Runs each weekday morning: Monday posts a week roll-up, Tue–Fri post
// "out today". Silent when nobody's off.
//
// Holidays surface here when ACTIVE (no post on booking); absences also get their
// own instant post at mark time — this digest is the once-a-morning summary.

import { prisma } from "@/lib/prisma";
import { getSlackBotToken, postMessage } from "@/server/slack/client";

const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DM_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function dayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
// Monday (UTC) of the week containing `d`.
function mondayOf(d: Date): Date {
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(dayUtc(d), -offset);
}
// First weekday strictly after `d`.
function nextWorkingDay(d: Date): Date {
  let x = addDays(d, 1);
  while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x = addDays(x, 1);
  return x;
}
function wholeDaysInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: "holiday",
  SICK: "sick leave",
  UNPAID: "unpaid leave",
  OTHER: "leave",
};
const ABSENCE_LABEL: Record<string, string> = {
  AWAY: "away",
  ILL: "off ill",
  WFH: "WFH",
  APPOINTMENT: "appointment",
};

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

export type DigestMode = "daily" | "weekly";

// Compose the digest text for a workspace + mode. Returns null when nobody's off.
export async function buildAvailabilityDigest(
  workspaceId: string,
  mode: DigestMode,
  ref = new Date(),
): Promise<string | null> {
  const today = dayUtc(ref);
  const rangeStart = mode === "weekly" ? mondayOf(ref) : today;
  const rangeEnd = mode === "weekly" ? addDays(mondayOf(ref), 6) : today; // Mon–Sun for the week

  const [leave, absences] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        workspaceId,
        status: "APPROVED",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
        user: { email: { not: BOOTSTRAP_USER_EMAIL } },
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.absence.findMany({
      where: {
        workspaceId,
        date: { lte: rangeEnd },
        OR: [{ endDate: { gte: rangeStart } }, { endDate: null, date: { gte: rangeStart } }],
      },
      include: {
        user: { select: { name: true, email: true } },
        coverUser: { select: { name: true, email: true } },
        coverClient: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  if (leave.length === 0 && absences.length === 0) return null;

  const lines: string[] = [];

  if (mode === "weekly") {
    lines.push(`*This week — ${DM_FMT.format(rangeStart)}–${DM_FMT.format(rangeEnd)}*`);
  } else {
    lines.push(`*Out today — ${DAY_FMT.format(today)}*`);
  }

  if (leave.length > 0) {
    lines.push("", "🏖️ *Leave*");
    for (const l of leave) {
      const name = displayName(l.user);
      const kind = LEAVE_LABEL[l.type] ?? "leave";
      if (mode === "weekly") {
        lines.push(`• ${name} — ${kind}, ${DM_FMT.format(l.startDate)}–${DM_FMT.format(l.endDate)}`);
      } else {
        const daysLeft = wholeDaysInclusive(today, l.endDate);
        const back = DAY_FMT.format(nextWorkingDay(l.endDate));
        const left = daysLeft === 1 ? "last day" : `${daysLeft} days left`;
        lines.push(`• ${name} — ${kind}, back ${back} (${left})`);
      }
    }
  }

  if (absences.length > 0) {
    lines.push("", "🗓️ *Absences*");
    for (const a of absences) {
      const name = displayName(a.user);
      const kind = ABSENCE_LABEL[a.kind] ?? a.kind.toLowerCase();
      const cover =
        a.coverActive && a.coverUser
          ? ` — ${displayName(a.coverUser)} covering${a.coverClient ? ` ${a.coverClient.name}` : ""}`
          : "";
      const span =
        mode === "weekly" && a.endDate
          ? ` (${DM_FMT.format(a.date)}–${DM_FMT.format(a.endDate)})`
          : "";
      lines.push(`• ${name} — ${kind}${span}${cover}`);
    }
  }

  return lines.join("\n");
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

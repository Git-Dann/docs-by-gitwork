import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { googleClientForRefreshToken } from "@/server/google-auth";
import type { EffectiveUser } from "@/server/auth/effective-user";
import type { CalendarConnectionMember, TeamCalendarEvent } from "@/types/backstage";

// Legacy pre-auth seed account — excluded from team-facing lists (see backstage.ts).
const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

// Monday-first 6-week grid window for the given month — matches getCalendarMonth
// so overlaid Google events line up with the rendered cells.
export function monthGridRange(year: number, month: number): { from: Date; to: Date } {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const from = new Date(firstOfMonth);
  from.setUTCDate(firstOfMonth.getUTCDate() - mondayOffset);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6 * 7); // 42 days, exclusive upper bound is fine for timeMax
  return { from, to };
}

// Workspace members who have connected Google (hold a per-user refresh token), so
// their calendar can be overlaid. The bootstrap placeholder is excluded.
export async function listCalendarConnections(
  user: EffectiveUser,
): Promise<{ selfConnected: boolean; members: CalendarConnectionMember[] }> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: user.workspaceId,
      user: {
        email: { not: BOOTSTRAP_USER_EMAIL },
        googleOAuthRefreshToken: { not: null },
      },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return {
    selfConnected: members.some((m) => m.user.id === user.id),
    members: members.map((m) => ({
      id: m.user.id,
      name: displayName(m.user),
      isSelf: m.user.id === user.id,
    })),
  };
}

// Fetch primary-calendar events for the requested connected members over the
// month grid window. Each member's own stored refresh token is used (read-only).
// A member whose token is missing/expired is silently skipped.
export async function getTeamCalendarEvents(
  user: EffectiveUser,
  userIds: string[],
  year: number,
  month: number,
): Promise<TeamCalendarEvent[]> {
  if (userIds.length === 0) return [];
  const { from, to } = monthGridRange(year, month);

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: user.workspaceId,
      userId: { in: userIds },
      user: { googleOAuthRefreshToken: { not: null } },
    },
    include: {
      user: { select: { id: true, name: true, email: true, googleOAuthRefreshToken: true } },
    },
  });

  const perMember = await Promise.all(
    members.map(async (m): Promise<TeamCalendarEvent[]> => {
      const token = m.user.googleOAuthRefreshToken;
      if (!token) return [];
      const client = googleClientForRefreshToken(token);
      if (!client) return [];
      try {
        const calendar = google.calendar({ version: "v3", auth: client });
        const res = await calendar.events.list({
          calendarId: "primary",
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });
        const name = displayName(m.user);
        const out: TeamCalendarEvent[] = [];
        for (const ev of res.data.items ?? []) {
          if (ev.status === "cancelled") continue;
          const startRaw = ev.start?.dateTime ?? ev.start?.date;
          const endRaw = ev.end?.dateTime ?? ev.end?.date;
          if (!startRaw) continue;
          const allDay = !ev.start?.dateTime;
          // Respect privacy: don't leak titles of events marked private.
          const summary = ev.visibility === "private" ? "Busy" : ev.summary ?? "Busy";
          out.push({
            id: `${m.user.id}:${ev.id ?? startRaw}`,
            userId: m.user.id,
            userName: name,
            summary,
            start: startRaw,
            end: endRaw ?? startRaw,
            allDay,
          });
        }
        return out;
      } catch {
        // Token revoked/expired or API error — skip this member rather than failing the whole grid.
        return [];
      }
    }),
  );

  return perMember.flat();
}

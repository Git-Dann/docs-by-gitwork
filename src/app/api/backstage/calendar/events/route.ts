// GET /api/backstage/calendar/events?from=ISO&to=ISO
// The signed-in person's own Google Calendar, for Foundry for Mac's calendar view. Accepts the
// mobile JWT as well as a session (the older /api/integrations/calendar is session-only and
// returns only upcoming meetings). Read-only.
import { google } from "googleapis";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { parseCalendarRange, toAppEvent } from "@/lib/calendar-range";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { googleClientForRefreshToken } from "@/server/google-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    // Private, like Commitments: never shown to someone "viewing as" this person.
    const viewingAs = req.headers.get("x-view-as-user");
    if (viewingAs && viewingAs === user.id) {
      return apiError("Calendars are private, so they aren't shown while viewing as someone.", 403);
    }

    const url = new URL(req.url);
    const range = parseCalendarRange(url.searchParams.get("from"), url.searchParams.get("to"));
    if (!range) return apiError("from and to must be ISO dates, in order, at most 62 days apart.", 400);

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
    });
    if (!row?.googleOAuthRefreshToken) {
      return apiOk({ connected: false, reason: "Google isn't connected for you. Sign out of Foundry on the web and back in.", events: [] });
    }
    const auth = googleClientForRefreshToken(row.googleOAuthRefreshToken);
    if (!auth) return apiOk({ connected: false, reason: "Google sign-in isn't configured on this server.", events: [] });

    try {
      const calendar = google.calendar({ version: "v3", auth });
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });
      const events = (res.data.items ?? []).map(toAppEvent).filter((e) => e !== null);
      return apiOk({ connected: true, connectedAs: row.googleOAuthEmail, events });
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (/invalid_grant/i.test(message)) {
        return apiOk({ connected: false, reason: "Google sign-in has expired. Sign out of Foundry on the web and back in.", events: [] });
      }
      throw err;
    }
  } catch (e) {
    return fromError(e);
  }
}

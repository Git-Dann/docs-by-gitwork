import { google } from "googleapis";
import { apiOk, fromError } from "@/lib/api-response";
import { getUserGoogleAuth } from "@/server/google-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/calendar → upcoming events for the *signed-in user*.
 *
 * Uses the current user's stored Google OAuth refresh token, NEVER the workspace-level
 * token. Each teammate sees only their own calendar. The old workspace path that powered
 * everyone's widget from one shared token caused cross-user data leakage — removed.
 */
export async function GET() {
  try {
    const authResult = await getUserGoogleAuth();
    if (!authResult.ok) {
      // For UI: any non-ok result renders the "Re-connect via Google" state. We don't
      // differentiate reasons since they all point to the same fix (sign in again).
      return apiOk({ connected: false, events: [] });
    }

    const calendar = google.calendar({ version: "v3", auth: authResult.client });

    const now = new Date();
    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: twoWeeksAhead.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });

    const events = (res.data.items ?? []).map((ev) => {
      const meetLink =
        ev.hangoutLink ??
        ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
        null;

      return {
        id: ev.id ?? "",
        summary: ev.summary ?? "(no title)",
        start: ev.start?.dateTime ?? ev.start?.date ?? "",
        end: ev.end?.dateTime ?? ev.end?.date ?? "",
        attendees: (ev.attendees ?? []).map((a) => a.email ?? a.displayName ?? "").filter(Boolean),
        location: ev.location ?? null,
        meetLink,
      };
    });

    return apiOk({ connected: true, events, connectedAs: authResult.email });
  } catch (error) {
    return fromError(error);
  }
}

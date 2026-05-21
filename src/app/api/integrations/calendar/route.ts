import { google } from "googleapis";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();

    if (!workspace.googleServiceAccountJson) {
      return apiOk({ connected: false, events: [] });
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
    } catch {
      return apiError("Invalid Google service account JSON", 422);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const authClient = await auth.getClient();
    if (workspace.googleSubjectEmail && "subject" in authClient) {
      (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
    }

    const calendar = google.calendar({
      version: "v3",
      auth: authClient as Parameters<typeof google.calendar>[0]["auth"],
    });

    const now = new Date();
    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: workspace.googleCalendarId ?? "primary",
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

    return apiOk({ connected: true, events });
  } catch (error) {
    return fromError(error);
  }
}

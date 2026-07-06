import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { loggerFor } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { googleClientForRefreshToken } from "@/server/google-auth";
import {
  listRecentMeetCalls,
  attributeToClient,
  ingestMeeting,
  type CalendarCandidate,
} from "@/server/meetings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GClient = NonNullable<ReturnType<typeof googleClientForRefreshToken>>;

// How far back to scan each run. Transcripts appear minutes-to-hours after a call; re-scanning
// a couple of days lets late/initially-missing transcripts get picked up. SUMMARISED meetings
// are skipped, so re-scans are cheap (a calendar read + a Meet check, no AI).
const LOOKBACK_DAYS = 2;
// Hard cap on transcripts summarised per run, so one cron invocation stays within maxDuration.
// Backlog clears over subsequent runs (oldest first). Anything dropped is logged in the result.
const MAX_PER_RUN = 6;

// Scribe auto-pulls only from the calendars of the people who organise client calls, so it
// doesn't ingest everyone's internal standups (e.g. a dev's daily standup). Anyone can still
// pull a specific call by hand via "Grab note" on the client page.
const SCRIBE_ORGANISER_EMAILS = new Set([
  "dan@gitwork.co.uk",
  "harry@gitwork.co.uk",
  "syed@gitwork.co.uk",
]);

/**
 * GET /api/cron/meet-transcripts  (Vercel cron)
 *
 * Scribe automation: auto-pull Google Meet transcripts for recently-ended client calls so notes
 * appear on client pages without anyone clicking "Fetch notes".
 *
 * Transcripts are readable via a *participant's* OAuth, so we iterate workspace members' stored
 * Google tokens. Each meeting is processed once per run (deduped by calendar event), preferring
 * the organiser's token (most likely to have transcript access), and only when its attendees
 * attribute to exactly one client. Idempotent: ingestMeeting upserts by (workspace, event).
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { id: true },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    // Members with a stored Google refresh token (their calendar + Meet access), scoped to the
    // designated Scribe organisers so we don't auto-ingest everyone's internal standups.
    const connectedMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, user: { googleOAuthRefreshToken: { not: null } } },
      select: {
        user: { select: { id: true, googleOAuthRefreshToken: true, googleOAuthEmail: true } },
      },
    });
    const members = connectedMembers.filter((m) => {
      const email = m.user.googleOAuthEmail?.toLowerCase();
      return email !== undefined && SCRIBE_ORGANISER_EMAILS.has(email);
    });
    if (members.length === 0) return apiOk({ reason: "no_connected_organisers", processed: 0 });

    // Existing meetings → status, so we skip already-summarised events (no re-charging the AI).
    const existing = await prisma.meeting.findMany({
      where: { workspaceId: workspace.id, calendarEventId: { not: null } },
      select: { calendarEventId: true, status: true },
    });
    const statusByEvent = new Map(
      existing.map((m: { calendarEventId: string | null; status: string }) => [m.calendarEventId!, m.status]),
    );

    // Gather candidate calls across all members, grouped by calendar event. We track which
    // members' clients can be used per event so we can prefer the organiser's token.
    type EventWork = {
      call: CalendarCandidate;
      clientByEmail: Map<string, GClient>;
      memberIdByEmail: Map<string, string>;
    };
    const byEvent = new Map<string, EventWork>();
    const now = Date.now();
    const memberErrors: string[] = [];

    for (const { user } of members) {
      if (!user.googleOAuthRefreshToken) continue;
      const client = googleClientForRefreshToken(user.googleOAuthRefreshToken);
      if (!client) continue;

      let calls: CalendarCandidate[];
      try {
        calls = await listRecentMeetCalls(client, LOOKBACK_DAYS);
      } catch (err) {
        memberErrors.push(`${user.googleOAuthEmail ?? user.id}: ${String(err).slice(0, 120)}`);
        continue;
      }

      const email = user.googleOAuthEmail?.toLowerCase();
      for (const call of calls) {
        // Only ended meetings can have a transcript.
        if (call.end && new Date(call.end).getTime() > now) continue;

        let work = byEvent.get(call.calendarEventId);
        if (!work) {
          work = { call, clientByEmail: new Map(), memberIdByEmail: new Map() };
          byEvent.set(call.calendarEventId, work);
        }
        if (email) {
          work.clientByEmail.set(email, client);
          work.memberIdByEmail.set(email, user.id);
        }
      }
    }

    // Resolve each event to a single client + the best token to fetch with.
    type WorkItem = { call: CalendarCandidate; client: GClient; ownerUserId: string | null; clientId: string };
    const workItems: WorkItem[] = [];
    // Calls we looked at but couldn't tie to exactly one client (no match or ambiguous). These
    // are silently skipped today; surfacing them lets an operator spot notes that never landed.
    const unattributed: string[] = [];
    for (const [eventId, work] of byEvent) {
      if (statusByEvent.get(eventId) === "SUMMARISED") continue;

      const clientId = await attributeToClient(workspace.id, work.call.attendees);
      if (!clientId) {
        unattributed.push(work.call.title?.trim() || eventId);
        continue; // not a client meeting (or ambiguous) — skip
      }

      const organiser = work.call.organizerEmail?.toLowerCase();
      const chosenEmail =
        organiser && work.clientByEmail.has(organiser) ? organiser : [...work.clientByEmail.keys()][0];
      const client = chosenEmail ? work.clientByEmail.get(chosenEmail) : undefined;
      if (!client) continue;

      workItems.push({
        call: work.call,
        client,
        ownerUserId: chosenEmail ? work.memberIdByEmail.get(chosenEmail) ?? null : null,
        clientId,
      });
    }

    // Oldest first so a backlog drains in order; cap per run.
    workItems.sort((a, b) => a.call.start.localeCompare(b.call.start));
    const toProcess = workItems.slice(0, MAX_PER_RUN);
    const dropped = workItems.length - toProcess.length;

    // Process the batch concurrently — each ingest is an independent Meet fetch + one AI call,
    // so wall-time stays bounded by the slowest single meeting (not the sum) within maxDuration.
    let ingested = 0;
    let withTranscript = 0;
    const ingestErrors: string[] = [];
    const results = await Promise.allSettled(
      toProcess.map((item) =>
        ingestMeeting({
          workspaceId: workspace.id,
          clientId: item.clientId,
          ownerUserId: item.ownerUserId,
          client: item.client,
          calendarEventId: item.call.calendarEventId,
          title: item.call.title,
          meetingCode: item.call.meetingCode ?? "",
          eventStart: item.call.start,
          eventEnd: item.call.end,
          attendees: item.call.attendees,
        }),
      ),
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        ingested += 1;
        if (r.value && (r.value.status === "SUMMARISED" || r.value.status === "TRANSCRIBED")) {
          withTranscript += 1;
        }
      } else {
        ingestErrors.push(`${toProcess[i].call.calendarEventId}: ${String(r.reason).slice(0, 120)}`);
      }
    });

    const log = loggerFor("cron:meet-transcripts");
    if (dropped > 0) {
      log.warn("eligible meetings deferred to a later run", { dropped, cap: MAX_PER_RUN });
    }
    if (unattributed.length > 0) {
      log.warn("recent calls had no single-client match (skipped)", {
        count: unattributed.length,
        sample: unattributed.slice(0, 10),
      });
    }

    return apiOk({
      members: members.length,
      candidates: workItems.length,
      processed: toProcess.length,
      ingested,
      withTranscript,
      dropped,
      unattributed: unattributed.length,
      unattributedSample: unattributed.slice(0, 10),
      errors: [...memberErrors, ...ingestErrors],
    });
  } catch (error) {
    return fromError(error);
  }
}

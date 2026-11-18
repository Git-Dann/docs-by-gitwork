import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getUserGoogleAuth } from "@/server/google-auth";
import { ingestMeeting, resummariseStoredNotes } from "@/server/meetings";
import { meetingIngestSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { recordAuditEntry } from "@/server/audit-log";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";
// Synchronous: fetch the Meet transcript + one Claude summarise call. Comfortably under 60s
// for a typical meeting (transcript is truncated before the model call), so the UI gets the
// finished notes back without polling — same spinner UX as the dashboard meeting summary.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * POST /api/clients/{slug}/meetings/ingest
 *
 * Pull the Google Meet transcript for a past calendar event, attribute it to this client,
 * store it, and summarise it. Returns the finished Meeting record (or a NO_TRANSCRIPT row when
 * transcription wasn't on / isn't ready yet — the caller can retry later).
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const workspaceId = await workspaceIdForRequest(req);
    const { slug } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);
    const body = meetingIngestSchema.parse(await req.json());

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    // Retry on a call whose notes were already read but whose AI summary failed: summarise the
    // saved notes again. No Drive read, so it works whoever presses it and whatever their Google.
    const resummarised = await resummariseStoredNotes(workspaceId, client.id, body.calendarEventId);
    if (resummarised) {
      const session = await auth().catch(() => null);
      void recordAuditEntry({
        workspaceId,
        actorId: session?.user?.id ?? null,
        action: "client.meeting.ingested",
        target: slug,
        metadata: { calendarEventId: body.calendarEventId, meetingId: resummarised.id, resummarised: true },
      });
      return apiOk({ meeting: resummarised });
    }

    const googleAuth = await getUserGoogleAuth();
    if (!googleAuth.ok) {
      return apiError("Connect your Google account (sign out and back in) to fetch Meet transcripts.", 422);
    }

    const session = await auth().catch(() => null);

    const meeting = await ingestMeeting({
      workspaceId,
      clientId: client.id,
      ownerUserId: session?.user?.id ?? null,
      client: googleAuth.client,
      calendarEventId: body.calendarEventId,
      title: body.title,
      meetingCode: body.meetingCode,
      eventStart: body.start ?? null,
      eventEnd: body.end ?? null,
      attendees: body.attendees ?? [],
    });

    // Audit the (paid) AI summarisation trigger — who fetched notes for which client/event.
    void recordAuditEntry({
      workspaceId,
      actorId: session?.user?.id ?? null,
      action: "client.meeting.ingested",
      target: slug,
      metadata: { calendarEventId: body.calendarEventId, meetingId: meeting?.id ?? null },
    });

    return apiOk({ meeting });
  } catch (error) {
    return fromError(error);
  }
}

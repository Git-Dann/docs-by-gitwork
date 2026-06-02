import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getUserGoogleAuth } from "@/server/google-auth";
import { ingestMeeting } from "@/server/meetings";
import { meetingIngestSchema } from "@/server/validators";

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
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;
    const body = meetingIngestSchema.parse(await req.json());

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const googleAuth = await getUserGoogleAuth();
    if (!googleAuth.ok) {
      return apiError("Connect your Google account (sign out and back in) to fetch Meet transcripts.", 422);
    }

    const session = await auth().catch(() => null);

    const meeting = await ingestMeeting({
      workspaceId: workspace.id,
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

    return apiOk({ meeting });
  } catch (error) {
    return fromError(error);
  }
}

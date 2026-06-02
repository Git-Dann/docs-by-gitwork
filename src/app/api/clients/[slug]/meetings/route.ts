import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getUserGoogleAuth } from "@/server/google-auth";
import { listClientMeetings, findPastClientCalls, deriveClientDomains } from "@/server/meetings";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/clients/{slug}/meetings
 *
 * Scribe's per-client view: the meetings we've already captured notes for, plus recent past
 * client calls on the signed-in user's calendar that we *could* pull notes for (candidates).
 * Calendar is best-effort — if Google isn't connected we just return the stored meetings.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;
    const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: workspace.id },
      select: { id: true, website: true, primaryContactEmail: true },
    });
    if (!client) return apiError("Client not found", 404);

    const meetings = await listClientMeetings(workspace.id, client.id, q);

    // Candidate past calls from the signed-in user's calendar (best-effort). Skipped in search
    // mode — candidates have no transcript to search, and the user is looking through past notes.
    let candidates: Awaited<ReturnType<typeof findPastClientCalls>> = [];
    let calendarConnected = false;
    if (!q) {
      const auth = await getUserGoogleAuth();
      if (auth.ok) {
        calendarConnected = true;
        try {
          const domains = deriveClientDomains(client);
          const ingestedEventIds = new Set(
            meetings.map((m: { calendarEventId: string | null }) => m.calendarEventId).filter(Boolean),
          );
          const found = await findPastClientCalls(auth.client, domains);
          candidates = found.filter((c) => !ingestedEventIds.has(c.calendarEventId));
        } catch {
          // Calendar unavailable — keep the stored meetings, drop candidates.
        }
      }
    }

    return apiOk({ meetings, candidates, calendarConnected, query: q ?? null });
  } catch (error) {
    return fromError(error);
  }
}

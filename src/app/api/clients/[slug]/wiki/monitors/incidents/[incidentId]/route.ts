import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { INCIDENT_STATUSES, MAX_UPDATE_LENGTH } from "@/lib/monitor-incidents";
import { acknowledgeIncident, addIncidentUpdate } from "@/server/wiki-monitors";

/**
 * POST — act on a monitor incident: acknowledge it, or post an update (shown to the client
 * unless marked internal). Signed-in team members who can open this client.
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge") }),
  z.object({
    action: z.literal("update"),
    status: z.enum(INCIDENT_STATUSES),
    message: z.string().trim().min(1).max(MAX_UPDATE_LENGTH),
    isPublic: z.boolean(),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  try {
    const { slug, incidentId } = await params;
    const user = await requireAuthedUser(req);
    await assertClientAccessBySlug(user, slug);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: user.workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const by = { userId: user.id, name: user.name?.trim() || user.email };
    const input = schema.parse(await req.json());
    const incident =
      input.action === "acknowledge"
        ? await acknowledgeIncident(client.id, incidentId, by)
        : await addIncidentUpdate(client.id, incidentId, input, by);
    if (!incident) return apiError("Incident not found", 404);
    return apiOk(incident);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * The Meetings section (internal).
 *
 *   GET   → this client's meetings that have notes, and which are shared
 *   PATCH → { enabled } to switch the section, or { meetingId, shared } to share one
 *
 * Sharing is per meeting and explicit — see src/server/wiki-meetings.ts.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  listShareableMeetings,
  setMeetingShared,
  setWikiMeetingsEnabled,
} from "@/server/wiki-meetings";

const patchSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ meetingId: z.string().trim().min(1).max(100), shared: z.boolean() }),
]);

async function clientIdFor(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the meetings section");
    const clientId = await clientIdFor((await params).slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ meetings: await listShareableMeetings(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the meetings section");
    const clientId = await clientIdFor((await params).slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = patchSchema.parse(await req.json());
    if ("enabled" in body) {
      await setWikiMeetingsEnabled(clientId, body.enabled);
      return apiOk({ enabled: body.enabled });
    }
    // Scoped to this client inside setMeetingShared — another client's meeting id matches
    // nothing and is reported as not found, never shared into the wrong wiki.
    const ok = await setMeetingShared(clientId, body.meetingId, body.shared);
    if (!ok) return apiError("Meeting not found for this client", 404);
    return apiOk({ meetingId: body.meetingId, shared: body.shared });
  } catch (err) {
    return fromError(err);
  }
}

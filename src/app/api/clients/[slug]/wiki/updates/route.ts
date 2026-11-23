/**
 * Updates in a client's wiki, the team's side (CLAUDE.md §147).
 *   GET   the page: the client's copy of the timeline and the published updates.
 *   POST  { weekStart, subject, body }: publish (or replace) a week's update. Switches the section on.
 *   PATCH { enabled }: switch the section on or off (Add New / delete).
 * The caller must be able to open this client; publishing and switching need 'Manage clients'.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientReader, assertClientWriter } from "@/server/client-write-access";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { prisma } from "@/lib/prisma";
import { UPDATE_LIMITS } from "@/lib/wiki-updates";
import { loadUpdatesView, publishUpdate, setWikiUpdatesEnabled } from "@/server/wiki-updates";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const publishSchema = z
  .object({
    weekStart: z.string().max(10),
    subject: z.string().max(UPDATE_LIMITS.subject),
    body: z.string().max(UPDATE_LIMITS.body),
  })
  .strict();

const toggleSchema = z.object({ enabled: z.boolean() }).strict();

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { slug } = await params;
    await assertClientReader(req, slug);
    const user = await requireAuthedUser(req);
    const clientId = await requireClientIdForSlug(slug, req);
    const wiki = await prisma.clientWiki.findUnique({ where: { clientId }, select: { id: true } });
    if (!wiki) return apiError("This client has no wiki yet.", 404);
    const view = await loadUpdatesView(user.workspaceId, clientId, wiki.id);
    if (!view) return apiError("Client not found", 404);
    return apiOk(view);
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "publish updates to a client's wiki");
    const clientId = await requireClientIdForSlug(slug, req);
    const parsed = publishSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Send weekStart, subject and body.", 400);
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
    const published = await publishUpdate(clientId, parsed.data, { userId: user.id, name: me?.name?.trim() || "Gitwork" });
    return apiOk(published);
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "manage the Updates section");
    const clientId = await requireClientIdForSlug(slug, req);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiUpdatesEnabled(clientId, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}

/** DELETE: take a published update off the client's wiki (archived, never deleted). CLAUDE.md §147. */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientWriter } from "@/server/client-write-access";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { unpublishUpdate } from "@/server/wiki-updates";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    await assertClientWriter(req, slug);
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "unpublish an update");
    const clientId = await requireClientIdForSlug(slug, req);
    await unpublishUpdate(clientId, id);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

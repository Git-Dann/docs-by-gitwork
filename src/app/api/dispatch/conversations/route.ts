import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { listOwnConversations } from "@/server/dispatch/assistant/store";

export const dynamic = "force-dynamic";

/** GET /api/dispatch/conversations?clientSlug= — the caller's own recent chats, and whether they can use Dispatch. */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const available = await assistantAvailable(user);
    if (!available) return apiOk({ available: false, conversations: [] });
    const slug = new URL(req.url).searchParams.get("clientSlug");
    const client = slug
      ? await prisma.workspaceClient.findFirst({ where: { slug, workspaceId: user.workspaceId }, select: { id: true } })
      : null;
    const rows = await listOwnConversations(user, client?.id);
    return apiOk({
      available: true,
      conversations: rows.map((r) => ({ id: r.id, clientId: r.clientId, title: r.title, updatedAt: r.updatedAt.toISOString() })),
    });
  } catch (err) {
    return fromError(err);
  }
}

import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { deleteOwnConversation, getOwnConversation } from "@/server/dispatch/assistant/store";
import { chatTimeline } from "@/server/dispatch/assistant/timeline";

export const dynamic = "force-dynamic";

/** GET — the caller's own chat as the panel shows it. Nobody can read anyone else's. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    const { id } = await params;
    const conv = await getOwnConversation(user, id);
    const [messages, actions, client] = await Promise.all([
      prisma.dispatchMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } }),
      prisma.dispatchAction.findMany({
        where: { conversationId: id, userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, payload: true, status: true, result: true, createdAt: true },
      }),
      prisma.workspaceClient.findFirst({ where: { id: conv.clientId, workspaceId: user.workspaceId }, select: { slug: true, name: true } }),
    ]);
    return apiOk({
      id: conv.id,
      title: conv.title,
      client: client ? { id: conv.clientId, slug: client.slug, name: client.name } : null,
      timeline: chatTimeline(messages, actions),
    });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteOwnConversation(user, id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

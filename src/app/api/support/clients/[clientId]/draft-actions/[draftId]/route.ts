import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateDraftAction } from "@/server/support";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getChannelAdapter } from "@/server/support-channels";
import type { SyncContext } from "@/server/support-channels/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = await request.json();

    // On approval of a REPLY draft: try to send via the channel adapter.
    // If the adapter supports sendReply, send and mark SENT; otherwise fall through
    // to a normal APPROVED status update (the user sends manually).
    if (body.status === "approved") {
      const draft = await prisma.draftSupportAction.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          type: true,
          body: true,
          clientId: true,
          status: true,
          ticket: {
            select: {
              conversation: {
                select: { id: true, source: true, externalId: true, clientId: true },
              },
            },
          },
        },
      });

      const conv = draft?.ticket?.conversation;
      if (draft?.type === "REPLY" && conv?.externalId) {
        const conn = await prisma.accountConnection.findFirst({
          where: { clientId: conv.clientId, source: conv.source },
          include: { channelTokens: true, client: { select: { id: true, name: true, slug: true } } },
        });

        const adapter = conn ? getChannelAdapter(conn.source) : null;
        if (adapter?.sendReply) {
          const workspace = await prisma.workspace.findFirst({
            where: { slug: DEFAULT_WORKSPACE_SLUG },
            select: {
              id: true,
              googleServiceAccountJson: true,
              googleSubjectEmail: true,
              googleOAuthRefreshToken: true,
              aiProvider: true,
              anthropicApiKey: true,
              anthropicModel: true,
              openaiApiKey: true,
              openaiModel: true,
              geminiApiKey: true,
              geminiModel: true,
              localLlmUrl: true,
              localLlmModel: true,
            },
          });

          if (workspace && conn) {
            const ctx: SyncContext = {
              connection: conn,
              client: conn.client,
              workspace,
            };
            await adapter.sendReply(ctx, conv.externalId, draft.body);

            await prisma.supportMessage.create({
              data: {
                conversationId: conv.id,
                direction: "outbound",
                authorLabel: "Support",
                body: draft.body,
                externalId: `draft:${draftId}:sent`,
                createdAt: new Date(),
              },
            });

            const draftAction = await updateDraftAction(draftId, { status: "sent" });
            return apiOk({ draftAction });
          }
        }
      }
    }

    const draftAction = await updateDraftAction(draftId, body);
    return apiOk({ draftAction });
  } catch (error) {
    return fromError(error);
  }
}

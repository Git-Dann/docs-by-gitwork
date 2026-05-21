import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import type { SyncContext, SyncResult } from "./types";
import { syncGmail } from "./gmail";
import { syncDiscord } from "./discord";
import { syncReddit } from "./reddit";
import { syncYouTube } from "./youtube";

export type { SyncContext, SyncResult };

export async function syncConnection(ctx: SyncContext): Promise<SyncResult> {
  const { connection } = ctx;

  try {
    switch (connection.source) {
      case "GMAIL":
        return await syncGmail(ctx);
      case "DISCORD":
        return await syncDiscord(ctx);
      case "REDDIT":
        return await syncReddit(ctx);
      case "YOUTUBE":
        return await syncYouTube(ctx);
      case "INSTAGRAM":
        throw new Error("Instagram integration coming soon — not yet available");
      case "CLICKUP":
        throw new Error("ClickUp integration coming soon — not yet available");
      case "STRIPE":
        throw new Error("Stripe integration uses webhooks — configure at /api/webhooks/stripe");
      default:
        throw new Error(`Unknown source: ${connection.source}`);
    }
  } catch (err) {
    await prisma.accountConnection.update({
      where: { id: connection.id },
      data: { health: "ERROR" },
    });
    throw err;
  }
}

export async function buildSyncContext(connId: string): Promise<SyncContext> {
  const connection = await prisma.accountConnection.findUniqueOrThrow({
    where: { id: connId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { googleServiceAccountJson: true, googleSubjectEmail: true },
  });

  return {
    connection,
    client: connection.client,
    workspace,
  };
}

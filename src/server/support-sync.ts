import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { runChannelSync } from "@/server/support-channels";
import { decryptScraperConfig } from "@/server/support";
import type { SyncContext, SyncResult, FilterReasons } from "@/server/support-channels/types";

// Re-exported for the API routes / agents that import these from here.
export type { SyncContext, SyncResult, FilterReasons };

// ─── Context builder (used by the per-connection sync route) ──────────────────

export async function buildSyncContext(connId: string): Promise<SyncContext> {
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
  if (!workspace) throw new Error("Workspace not found");

  const conn = await prisma.accountConnection.findUniqueOrThrow({
    where: { id: connId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  return {
    connection: {
      ...conn,
      scraperConfig: decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null),
    },
    client: conn.client,
    workspace,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Single entry point for syncing one connection. Delegates to the channel registry
 * (`runChannelSync`) and persists a compact run summary so the UI can show sync health
 * that survives reloads.
 */
export async function syncConnection(ctx: SyncContext): Promise<SyncResult> {
  const result = await runChannelSync(ctx);

  try {
    await prisma.accountConnection.update({
      where: { id: ctx.connection.id },
      data: {
        lastSyncStats: {
          fetched: result.fetched ?? null,
          ingested: result.ingested,
          filtered: result.filtered,
          filterReasons: result.filterReasons ?? null,
          hints: result.hints ?? [],
          errors: result.errors,
          at: new Date().toISOString(),
        } as object,
        ...(result.errors.length > 0 ? {} : { health: "CONNECTED" }),
      },
    });
  } catch {
    // Never let stats-writing failure mask a successful sync.
  }

  return result;
}

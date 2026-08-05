import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { runChannelSync } from "@/server/support-channels";
import { decryptScraperConfig, evaluateWorkflowRules } from "@/server/support";
import { enrichConversations } from "@/server/care-agents/enrich";
import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";
import type { SyncContext, SyncResult, FilterReasons } from "@/server/support-channels/types";

// Re-exported for the API routes / agents that import these from here.
export type { SyncContext, SyncResult, FilterReasons };

const WORKSPACE_AI_SELECT = {
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
} as const;

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

// ─── Client-level "Sync now" ──────────────────────────────────────────────────

/**
 * Sync every CONNECTED connection for one client (the cockpit "Sync now" button) and
 * schedule the same after-response enrichment + rules pass the daily cron uses, so a
 * manual sync gets the same triage classification + auto-routing as the scheduled run.
 * scraperConfig is decrypted per connection (no-op when ENCRYPTION_KEY is unset).
 */
export async function syncClientConnections(
  clientId: string,
): Promise<{ total: number; ingested: number; filtered: number; errors: string[] }> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: WORKSPACE_AI_SELECT,
  });
  if (!workspace) throw new Error("Workspace not found");

  const connections = await prisma.accountConnection.findMany({
    where: { health: "CONNECTED", clientId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];
  const newConversationIds: string[] = [];

  const results = await Promise.allSettled(
    connections.map(async (conn) => {
      const ctx: SyncContext = {
        connection: {
          ...conn,
          scraperConfig: decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null),
        },
        client: conn.client,
        workspace,
      };
      const result = await syncConnection(ctx);
      return { source: conn.source, connId: conn.id, result };
    }),
  );

  for (const res of results) {
    if (res.status === "fulfilled") {
      ingested += res.value.result.ingested;
      filtered += res.value.result.filtered;
      newConversationIds.push(...(res.value.result.newConversationIds ?? []));
      if (res.value.result.errors.length > 0) {
        errors.push(...res.value.result.errors.map((e) => `[${res.value.source}] ${e}`));
      }
    } else {
      errors.push(String(res.reason));
    }
  }

  // Course-requests-only clients (support paused): never triage; instead auto-import
  // the "New Feedback" course requests into the wiki. Run this on EVERY sync — not only
  // when new mail arrived this run — so an already-ingested backlog still gets filed.
  // The import dedupes by source conversation, so once caught up it's a cheap no-op
  // (nothing new → no AI call).
  const sc = await prisma.supportClient.findUnique({
    where: { id: clientId },
    select: { courseRequestOnly: true, workspaceClientId: true },
  });
  if (sc?.courseRequestOnly) {
    const wsClientId = sc.workspaceClientId;
    if (wsClientId) {
      after(async () => {
        await runCourseFeedbackImport(wsClientId, { onlyCourseRequests: true }).catch(console.error);
      });
    }
  } else if (newConversationIds.length > 0) {
    after(async () => {
      await enrichConversations({ workspace }, newConversationIds, { max: 50 }).catch(console.error);
      await Promise.allSettled(newConversationIds.map((convId) => evaluateWorkflowRules(clientId, convId)));
    });
  }

  return { total: connections.length, ingested, filtered, errors };
}

import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { runChannelSync } from "@/server/support-channels";
import { backfillConversationActivity, repairForwardedIdentities, evaluateWorkflowRules } from "@/server/support";
import { toSyncContext } from "@/server/support-scraper-config";
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

// `toSyncContext` lives in the dependency-light support-scraper-config module so it can be
// unit-tested; re-exported here because this is where callers expect sync plumbing to live.
export { toSyncContext };

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

  return toSyncContext(conn, workspace);
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
      const result = await syncConnection(toSyncContext(conn, workspace));
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

  await runPostSyncHousekeeping({ clientId, workspace, newConversationIds });

  return { total: connections.length, ingested, filtered, errors };
}

/**
 * Everything that must happen after mail lands, wherever the sync was started from.
 *
 * ⚠️ **This exists because Care has THREE sync entry points and the housekeeping was wired into
 * one of them.** `syncSupportClient` (the header's "Sync now") ran the identity repair and the
 * activity backfill; the per-connection route behind the Channels panel's Refresh / "Re-sync
 * history" buttons and the nightly cron both called `syncConnection` directly and ran neither. So
 * the two paths an operator actually uses to fix a broken board were the two that could not fix
 * it — a client could be re-synced repeatedly, report success, and stay wrong. Meanwhile the
 * course-request branch was copy-pasted into all three, each with a comment claiming it matched
 * the others.
 *
 * One function, called by all three. Adding a step here reaches every path by construction, which
 * is the only version of this that stays true.
 *
 * ⚠️ Call it **once per client**, not once per connection — a client with three connectors would
 * otherwise pay for the repair three times per cron run.
 */
/** What the housekeeping actually did, so a sync can say so instead of reporting a bare success. */
export interface HousekeepingResult {
  /** Conversations whose forwarder label / echoed preview was corrected. */
  relabelled: number;
  /** Still-broken rows beyond this run's batch — non-zero means "sync again". */
  relabelRemaining: number;
  /** Conversations given reply-tracking stamps they previously lacked. */
  stamped: number;
}

export async function runPostSyncHousekeeping({
  clientId,
  workspace,
  newConversationIds,
}: {
  clientId: string;
  workspace: SyncContext["workspace"];
  /** Conversations created by THIS run — the only ones worth enriching. */
  newConversationIds: string[];
}): Promise<HousekeepingResult> {
  // Both are bounded and self-terminating (they only match rows that still show the defect), so
  // once a client has drained they cost one indexed lookup per sync. That is why neither needs a
  // migration step or a one-shot route to become correct on existing history.
  //
  // Reported rather than silent: "I re-synced and nothing changed" was indistinguishable from
  // "there was nothing to change", which is most of why this took three attempts to diagnose.
  const outcome: HousekeepingResult = { relabelled: 0, relabelRemaining: 0, stamped: 0 };
  try {
    const repair = await repairForwardedIdentities(clientId);
    outcome.relabelled = repair.repaired;
    outcome.relabelRemaining = repair.remaining;
    const backfill = await backfillConversationActivity(clientId);
    outcome.stamped = backfill.updated;
  } catch (err) {
    // Housekeeping must never mask or fail a sync that ingested real mail.
    console.error("[support-sync] post-sync housekeeping failed", err);
  }

  // Course-requests-only clients (support paused): never triage; instead auto-import the
  // "New Feedback" course requests into the wiki. Runs on EVERY sync — not only when new mail
  // arrived — so an already-ingested backlog still gets filed. The import dedupes by source
  // conversation, so once caught up it is a cheap no-op (nothing new → no AI call).
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

  return outcome;
}

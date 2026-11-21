import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { runChannelSync } from "@/server/support-channels";
import { backfillConversationActivity, repairForwardedIdentities, evaluateWorkflowRules } from "@/server/support";
import { toSyncContext } from "@/server/support-scraper-config";
import { enrichConversations } from "@/server/care-agents/enrich";
import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";
import type { SyncContext, SyncResult, FilterReasons } from "@/server/support-channels/types";
import { careMode } from "@/lib/care-mode";
import { notifyConnectorHealth } from "@/server/care-alerts";
import {
  nextConnectorHealth,
  readHealthState,
  SENDABLE_CONNECTION,
  type ConnectorHealth,
} from "@/lib/care-connector-health";

// Re-exported for the API routes / agents that import these from here.
export type { SyncContext, SyncResult, FilterReasons };

/** ⚠️ `satisfies`, not `as const`. Extracting a Prisma args object into a named
 *  const DISABLES the excess-property check that would otherwise catch a field
 *  that does not exist — `as const` does NOT restore it (a bogus key compiles
 *  clean). This is the mechanism that 500'd every client's wiki in Sept 2026.
 *  See CLAUDE.md §50. */
const WORKSPACE_AI_SELECT = {
  id: true,
  googleServiceAccountJson: true,
  googleSubjectEmail: true,
  googleOAuthRefreshToken: true,
  aiProvider: true,
  anthropicApiKey: true,
  platformAiKeysAllowed: true,
  anthropicModel: true,
  openaiApiKey: true,
  openaiModel: true,
  geminiApiKey: true,
  geminiModel: true,
  localLlmUrl: true,
  localLlmModel: true,
} as const satisfies Prisma.WorkspaceSelect;

// ─── Context builder (used by the per-connection sync route) ──────────────────

// `toSyncContext` lives in the dependency-light support-scraper-config module so it can be
// unit-tested; re-exported here because this is where callers expect sync plumbing to live.
export { toSyncContext };

export async function buildSyncContext(connId: string): Promise<SyncContext> {
  const conn = await prisma.accountConnection.findUniqueOrThrow({
    where: { id: connId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true, workspaceId: true } },
    },
  });

  // The connection's own workspace, so it syncs with that business's keys and settings.
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: conn.client.workspaceId },
    select: WORKSPACE_AI_SELECT,
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

  /*
   * ⚠️ Health used to be written as `...(errors.length > 0 ? {} : { health: "CONNECTED" })` —
   * so it could only ever go UP. A mailbox whose app password had been revoked kept its green
   * badge while every run failed and no mail arrived, which is the single thing Care most needs
   * to be honest about. It degrades after two consecutive failures now (one run is a blip), and
   * `care-connector-health.ts` carries the recovery path with it.
   */
  const outcome = nextConnectorHealth({
    previousHealth: ctx.connection.health as ConnectorHealth,
    previous: readHealthState(ctx.connection.lastSyncStats),
    errors: result.errors,
  });

  /*
   * ⚠️ `justFailed` / `justRecovered` were computed here and DISCARDED — the latch was armed and
   * persisted in `ff19f83` and nothing ever fired on it, so a connector went red on a screen and
   * told nobody. The transition is the alert: one per outage, by construction.
   */
  if (outcome.justFailed || outcome.justRecovered) {
    notifyConnectorHealth({
      workspaceId: ctx.workspace.id,
      clientId: ctx.client.id,
      clientName: ctx.client.name,
      label: ctx.connection.label || ctx.connection.source,
      recovered: outcome.justRecovered,
      reason: result.errors[0] ?? null,
    });
  }

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
          consecutiveFailures: outcome.consecutiveFailures,
          failingSince: outcome.failingSince,
        } as object,
        health: outcome.health,
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
  const { workspaceId } = await prisma.supportClient.findUniqueOrThrow({
    where: { id: clientId },
    select: { workspaceId: true },
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: WORKSPACE_AI_SELECT,
  });

  /*
   * ⚠️ `health: "CONNECTED"` here would make a failing connector unreachable from the ONE button
   * a person presses to fix it — flipping it to ERROR would strand it for good. A NEEDS_SETUP
   * connector is genuinely not configured, so it stays out.
   */
  const connections = await prisma.accountConnection.findMany({
    where: { ...SENDABLE_CONNECTION, clientId },
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

  // An ingest-only client is never triaged: their mail is harvested, not answered, so classifying
  // it and running workflow rules over it would spend tokens on conversations nobody will read.
  //
  // ⚠️ The course-request IMPORT is gated on `courseRequestOnly` specifically, not on the mode.
  // `ingestOnly` is the general form and a client carrying it has no golf-course pipeline to file
  // anything into — running the importer against one would be looking for "New Feedback" emails
  // in a wiki section that does not exist.
  const sc = await prisma.supportClient.findUnique({
    where: { id: clientId },
    select: { ingestOnly: true, courseRequestOnly: true, workspaceClientId: true },
  });
  if (sc && careMode(sc) === "ingest_only") {
    const wsClientId = sc.workspaceClientId;
    if (sc.courseRequestOnly && wsClientId) {
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

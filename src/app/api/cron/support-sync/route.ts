import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { loggerFor } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncConnection, toSyncContext, runPostSyncHousekeeping } from "@/server/support-sync";
import { forEachWorkspace } from "@/server/workspaces/for-each";
import { isSyncDue, readHealthState, SENDABLE_CONNECTION } from "@/lib/care-connector-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = loggerFor("cron:support-sync");

/** ⚠️ `as const satisfies`: a named Prisma args object loses the excess-property check otherwise (CLAUDE.md §50). */
const WORKSPACE_SYNC_SELECT = {
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

type SyncWorkspace = Prisma.WorkspaceGetPayload<{ select: typeof WORKSPACE_SYNC_SELECT }>;

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    // One workspace at a time, each with its own keys and its own connectors, so a business's
    // mail is only read with that business's settings and one failure can't stop the rest.
    const runs = await forEachWorkspace(
      { where: { supportClients: { some: {} } }, select: WORKSPACE_SYNC_SELECT },
      (workspace) => syncWorkspace(workspace),
    );

    let total = 0;
    let ingested = 0;
    let filtered = 0;
    const errors: string[] = [];
    for (const run of runs) {
      if (!run.ok) {
        errors.push(`[${run.workspaceId}] ${run.error}`);
        continue;
      }
      total += run.result.total;
      ingested += run.result.ingested;
      filtered += run.result.filtered;
      errors.push(...run.result.errors);
    }

    return apiOk({ total, ingested, filtered, errors });
  } catch (error) {
    return fromError(error);
  }
}

async function syncWorkspace(
  workspace: SyncWorkspace,
): Promise<{ total: number; ingested: number; filtered: number; errors: string[] }> {
  /*
   * ⚠️ NOT `health: "CONNECTED"`. Auto-sync is the only thing that can ever prove a failing
   * connector has recovered, so excluding ERROR would strand it the moment it degraded — the
   * recovery path has to be widened in the same breath as the degrading (see
   * `care-connector-health.ts`). It retries on a slower cadence instead, via `isSyncDue`.
   */
  const allConnections = await prisma.accountConnection.findMany({
    where: { ...SENDABLE_CONNECTION, client: { workspaceId: workspace.id } },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  // Per-connector frequency: only sync a connection whose configured interval has elapsed
  // since its last sync. Interval lives on scraperConfig.syncIntervalMinutes (default 60 =
  // hourly; 0 = manual-only, never auto-synced). This lets the cron fire often (e.g. hourly)
  // while each connector keeps its own cadence.
  const now = new Date();
  const connections = allConnections.filter((conn) => {
    const cfg = (conn.scraperConfig ?? {}) as { syncIntervalMinutes?: number };
    const interval = typeof cfg.syncIntervalMinutes === "number" ? cfg.syncIntervalMinutes : 60;
    return isSyncDue({
      health: conn.health,
      intervalMinutes: interval,
      lastSyncedAt: conn.lastSyncedAt,
      consecutiveFailures: readHealthState(conn.lastSyncStats).consecutiveFailures,
      now,
    });
  });

  let totalIngested = 0;
  let totalFiltered = 0;
  const allErrors: string[] = [];
  // Track clientId per new conversation so rules are evaluated against the right client
  const newConvByClient: Array<{ clientId: string; convId: string }> = [];

  const results = await Promise.allSettled(
    connections.map(async (conn) => {
      // toSyncContext decrypts scraperConfig. Building the context inline here (as this
      // route used to) handed adapters `enc:…` secrets, so every IMAP/Discord/app-reviews/
      // analytics connector failed auth and lastSyncedAt never advanced — automated sync
      // was silently dead while manual "Sync now" worked.
      const result = await syncConnection(toSyncContext(conn, workspace));
      return { connId: conn.id, source: conn.source, clientId: conn.client.id, result };
    }),
  );

  for (const res of results) {
    if (res.status === "fulfilled") {
      totalIngested += res.value.result.ingested;
      totalFiltered += res.value.result.filtered;
      for (const convId of res.value.result.newConversationIds ?? []) {
        newConvByClient.push({ clientId: res.value.clientId, convId });
      }
      if (res.value.result.errors.length > 0) {
        allErrors.push(
          ...res.value.result.errors.map((e) => `[${res.value.source}:${res.value.connId.slice(-6)}] ${e}`),
        );
      }
    } else {
      allErrors.push(String(res.reason));
    }
  }

  // ⚠️ This route used to hand-roll the course-request drain and the enrich/rules fan-out — and
  // ran NEITHER the forwarded-identity repair nor the activity backfill, so the nightly sync
  // silently skipped both every night. One shared helper covers every entry point now.
  //
  // Called once per CLIENT, not once per connection: a client with three connectors would
  // otherwise pay for the repair three times per run.
  /*
   * ⚠️ Built from ALL this workspace's connectors, not the interval-filtered set. Housekeeping
   * is per-client work — the forwarded-identity repair, the activity backfill, the course-request
   * drain — and it is exactly the clients whose connectors are manual-only, or not due this
   * minute, that would otherwise never get it. The client set is the point, not the sync set.
   */
  const touchedClientIds = [...new Set(newConvByClient.map((n) => n.clientId).concat(
    allConnections.map((c) => c.client.id),
  ))];
  const newByClient = new Map<string, string[]>();
  for (const { clientId, convId } of newConvByClient) {
    newByClient.set(clientId, [...(newByClient.get(clientId) ?? []), convId]);
  }
  const housekeeping = await Promise.allSettled(
    touchedClientIds.map((clientId) =>
      runPostSyncHousekeeping({
        clientId,
        workspace,
        newConversationIds: newByClient.get(clientId) ?? [],
      }),
    ),
  );
  for (const [i, res] of housekeeping.entries()) {
    if (res.status === "rejected") log.error("post-sync housekeeping failed", res.reason);
    else if (res.value.relabelled > 0 || res.value.stamped > 0 || res.value.relabelRemaining > 0) {
      log.info("post-sync housekeeping", { clientId: touchedClientIds[i], ...res.value });
    }
  }

  return { total: connections.length, ingested: totalIngested, filtered: totalFiltered, errors: allErrors };
}

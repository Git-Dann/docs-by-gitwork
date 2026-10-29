import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { loggerFor } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncConnection, toSyncContext, runPostSyncHousekeeping, WORKSPACE_AI_SELECT } from "@/server/support-sync";
import { forEachWorkspace } from "@/server/workspaces/for-each";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = loggerFor("cron:support-sync");

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    // Once per workspace: each business's connectors sync with that business's own Google and
    // AI settings. The totals sum across them.
    const workspaces = await forEachWorkspace({ select: WORKSPACE_AI_SELECT }, syncWorkspace);
    const done = workspaces.flatMap((w) => (w.ok ? [w.result] : []));
    return apiOk({
      total: done.reduce((n, r) => n + r.total, 0),
      ingested: done.reduce((n, r) => n + r.ingested, 0),
      filtered: done.reduce((n, r) => n + r.filtered, 0),
      errors: [...done.flatMap((r) => r.errors), ...workspaces.flatMap((w) => (w.ok ? [] : [w.error]))],
      workspaces: workspaces.map((w) => ({ workspaceId: w.workspaceId, ok: w.ok })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function syncWorkspace(workspace: Prisma.WorkspaceGetPayload<{ select: typeof WORKSPACE_AI_SELECT }>) {
  const allConnections = await prisma.accountConnection.findMany({
    where: { health: "CONNECTED", client: { workspaceId: workspace.id } },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  // Per-connector frequency: only sync a connection whose configured interval has elapsed
  // since its last sync. Interval lives on scraperConfig.syncIntervalMinutes (default 60 =
  // hourly; 0 = manual-only, never auto-synced). This lets the cron fire often (e.g. hourly)
  // while each connector keeps its own cadence.
  const now = Date.now();
  const connections = allConnections.filter((conn) => {
    const cfg = (conn.scraperConfig ?? {}) as { syncIntervalMinutes?: number };
    const interval = typeof cfg.syncIntervalMinutes === "number" ? cfg.syncIntervalMinutes : 60;
    if (interval <= 0) return false; // manual-only
    if (!conn.lastSyncedAt) return true; // never synced → due
    return now - new Date(conn.lastSyncedAt).getTime() >= interval * 60_000;
  });

  let totalIngested = 0;
  let totalFiltered = 0;
  const allErrors: string[] = [];
  const allNewConversationIds: string[] = [];
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
        allNewConversationIds.push(convId);
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
  const touchedClientIds = [...new Set(newConvByClient.map((n) => n.clientId).concat(
    connections.map((c) => c.client.id),
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

  return {
    total: connections.length,
    ingested: totalIngested,
    filtered: totalFiltered,
    errors: allErrors,
  };
}

import { NextRequest, after } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { loggerFor } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { syncConnection, toSyncContext } from "@/server/support-sync";
import { enrichConversations } from "@/server/care-agents/enrich";
import { evaluateWorkflowRules } from "@/server/support";
import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = loggerFor("cron:support-sync");

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

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

    if (!workspace) return apiError("Workspace not found", 404);

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

    // ALL course-requests-only clients (support paused), regardless of whether they got
    // new mail this cycle — the import dedupes, so it drains any backlog and is a cheap
    // no-op once caught up. Their conversations are never triaged/enriched or rule-routed.
    const courseOnlyClients = await prisma.supportClient.findMany({
      where: { workspaceId: workspace.id, courseRequestOnly: true, workspaceClientId: { not: null } },
      select: { id: true, workspaceClientId: true },
    });
    const courseOnlyIds = new Set(courseOnlyClients.map((c) => c.id));

    // Enrich + evaluate workflow rules for newly-ingested conversations belonging to
    // NON-course-only clients — after the response, non-gating, never blocks sync.
    if (allNewConversationIds.length > 0 || courseOnlyClients.length > 0) {
      after(async () => {
        const triageConvIds = newConvByClient
          .filter(({ clientId }) => !courseOnlyIds.has(clientId))
          .map(({ convId }) => convId);

        if (triageConvIds.length > 0) {
          await enrichConversations({ workspace }, triageConvIds, { max: 50 }).catch((err) =>
            log.error("conversation enrichment failed", err),
          );
        }
        await Promise.allSettled(
          newConvByClient
            .filter(({ clientId }) => !courseOnlyIds.has(clientId))
            .map(({ clientId, convId }) => evaluateWorkflowRules(clientId, convId)),
        );

        // Drain course requests for every course-requests-only client.
        await Promise.allSettled(
          courseOnlyClients.map((c) =>
            runCourseFeedbackImport(c.workspaceClientId as string, { onlyCourseRequests: true }).catch((err) =>
              log.error("course-feedback auto-import failed", err),
            ),
          ),
        );
      });
    }

    return apiOk({
      total: connections.length,
      ingested: totalIngested,
      filtered: totalFiltered,
      errors: allErrors,
    });
  } catch (error) {
    return fromError(error);
  }
}

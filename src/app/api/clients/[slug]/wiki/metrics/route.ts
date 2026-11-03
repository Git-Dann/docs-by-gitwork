/**
 * The Metrics section's settings (internal). The figures themselves ride down in the wiki
 * DTO from stored snapshots — see src/server/wiki-metrics.ts.
 *
 *   GET   → the GET endpoints documented on this client's API Docs page (the only ones
 *           that can be picked as a source when there is no Care connector)
 *   PATCH → { enabled?, hiddenKeys?, featuredKeys?, apiEndpoint?, apiToken? }
 *   POST  → refresh: fetch what is missing or stale and store it
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  MetricsConfigError,
  listWikiMetricEndpoints,
  refreshWikiMetrics,
  setWikiMetricsConfig,
} from "@/server/wiki-metrics";

export const maxDuration = 60;

const key = z.string().trim().min(1).max(200);
const patchSchema = z.object({
  enabled: z.boolean().optional(),
  hiddenKeys: z.array(key).max(200).optional(),
  featuredKeys: z.array(key).max(3).optional(),
  apiEndpoint: z
    .object({ serverUrl: z.string().trim().min(1).max(500), path: z.string().trim().min(1).max(500) })
    .nullable()
    .optional(),
  apiToken: z.string().max(4000).optional(),
});

async function clientIdFor(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the metrics section");
    const clientId = await clientIdFor((await params).slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ endpoints: await listWikiMetricEndpoints(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the metrics section");
    const clientId = await clientIdFor((await params).slug);
    if (!clientId) return apiError("Client not found", 404);
    const patch = patchSchema.parse(await req.json());
    try {
      await setWikiMetricsConfig(clientId, patch);
    } catch (err) {
      if (err instanceof MetricsConfigError) return apiError(err.message, 400);
      throw err;
    }
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "refresh the metrics section");
    const clientId = await clientIdFor((await params).slug);
    if (!clientId) return apiError("Client not found", 404);
    // A person pressed Refresh now: re-read the running month even if it is fresh, or the
    // button would quietly do nothing for up to an hour.
    return apiOk(await refreshWikiMetrics(clientId, new Date(), { force: true }));
  } catch (err) {
    return fromError(err);
  }
}

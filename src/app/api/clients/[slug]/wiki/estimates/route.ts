/**
 * Estimates — how long the work takes with 1, 2, 3… developers.
 *
 * INTERNAL ONLY, by client slug. There is deliberately no `/api/wiki/[token]/estimates`
 * route: the client's view is read-only and the estimates ride down inside the wiki DTO,
 * exactly as Running costs and Charts do. The wiring test asserts that directory does not
 * exist.
 *
 * Gated on `canManageClients`, following the Running costs routes.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  createWikiEstimate,
  loadWikiEstimates,
  setWikiEstimatesEnabled,
} from "@/server/wiki-estimates";
import { estimateSchema } from "@/server/validators";

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view estimates");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiEstimates(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "add an estimate");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = estimateSchema.parse(await req.json());
    return apiOk(await createWikiEstimate(clientId, body), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const toggleSchema = z.object({ enabled: z.boolean() });

/** Toggle the section — the sidebar's Add New and delete. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage estimates");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiEstimatesEnabled(clientId, enabled);
    return apiOk(await loadWikiEstimates(clientId));
  } catch (err) {
    return fromError(err);
  }
}

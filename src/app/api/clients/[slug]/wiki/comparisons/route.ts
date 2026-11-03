/**
 * Comparisons — feature/plan comparison tables on a client's wiki.
 *
 * INTERNAL ONLY, by client slug. There is deliberately no `/api/wiki/[token]/comparisons`
 * route: the client's view is read-only and the tables ride down inside the wiki DTO,
 * exactly as Charts and Estimates do. The wiring test asserts that directory does not exist.
 *
 * GET lists · POST creates · PATCH toggles the section · PUT reorders.
 * Gated on `canManageClients`, following the Estimates routes.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  createWikiComparison,
  loadWikiComparisons,
  reorderWikiComparisons,
  setWikiComparisonsEnabled,
} from "@/server/wiki-comparisons";
import { comparisonOrderSchema, comparisonSchema } from "@/server/validators";

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
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view comparisons");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiComparisons(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "add a comparison");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = comparisonSchema.parse(await req.json());
    const comparison = await createWikiComparison(clientId, body);
    return apiOk({ comparison, section: await loadWikiComparisons(clientId) }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const toggleSchema = z.object({ enabled: z.boolean() });

/** Toggle the section — the sidebar's Add New and delete. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage comparisons");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiComparisonsEnabled(clientId, enabled);
    return apiOk(await loadWikiComparisons(clientId));
  } catch (err) {
    return fromError(err);
  }
}

/** Reorder the tables: `{ order: [id, id, …] }`. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "reorder comparisons");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { order } = comparisonOrderSchema.parse(await req.json());
    await reorderWikiComparisons(clientId, order);
    return apiOk(await loadWikiComparisons(clientId));
  } catch (err) {
    return fromError(err);
  }
}

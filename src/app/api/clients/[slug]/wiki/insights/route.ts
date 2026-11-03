/**
 * Insights — charts and diagrams a Gitwork user authors for a client's wiki.
 *
 * INTERNAL ONLY, by client slug. There is deliberately no `/api/wiki/[token]/insights`
 * route: the client side is read-only and boards ride down inside the wiki DTO, exactly
 * as code-handover does. A token route here would be dead surface with a live attack
 * surface.
 *
 * Gated on `canManageClients`, following the Launchpad routes.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  createInsightBoard,
  loadWikiInsights,
  reorderInsightBoards,
  setWikiInsightsEnabled,
} from "@/server/wiki-insights";
import { boardSchema } from "@/server/validators";

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
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view insights");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiInsights(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "create an insight board");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = boardSchema.parse(await req.json());
    return apiOk(await createInsightBoard(clientId, body), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const patchSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ order: z.array(z.string()).max(100) }),
]);

/** Toggle the section (the sidebar Add New / delete), or reorder the boards. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage insights");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = patchSchema.parse(await req.json());
    if ("enabled" in body) {
      await setWikiInsightsEnabled(clientId, body.enabled);
      return apiOk({ enabled: body.enabled });
    }
    await reorderInsightBoards(clientId, body.order);
    return apiOk(await loadWikiInsights(clientId));
  } catch (err) {
    return fromError(err);
  }
}

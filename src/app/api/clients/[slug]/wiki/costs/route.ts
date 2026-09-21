/**
 * Running costs — what the client's app costs to operate, and the cost per end user.
 *
 * INTERNAL ONLY, by client slug. There is deliberately no `/api/wiki/[token]/costs`
 * route: the client's view is read-only and the model rides down inside the wiki DTO,
 * exactly as Insights does (§48). A token write route here would be dead surface with a
 * live attack surface on a page that states a client's cost base.
 *
 * Gated on `canManageClients`, following the Launchpad and Insights routes.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  addWikiCostItem,
  loadWikiCosts,
  setWikiCostsEnabled,
  updateWikiCostSettings,
} from "@/server/wiki-costs";
import { costItemSchema, costSettingsSchema } from "@/server/validators";

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
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view running costs");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiCosts(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "add a cost line");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = costItemSchema.parse(await req.json());
    return apiOk(await addWikiCostItem(clientId, body), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const patchSchema = z.union([z.object({ enabled: z.boolean() }), costSettingsSchema]);

/** Toggle the section (the sidebar Add New / delete), or edit currency / headline / notes. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage running costs");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = patchSchema.parse(await req.json());
    if ("enabled" in body) {
      await setWikiCostsEnabled(clientId, body.enabled);
      return apiOk(await loadWikiCosts(clientId));
    }
    await updateWikiCostSettings(clientId, body);
    return apiOk(await loadWikiCosts(clientId));
  } catch (err) {
    return fromError(err);
  }
}

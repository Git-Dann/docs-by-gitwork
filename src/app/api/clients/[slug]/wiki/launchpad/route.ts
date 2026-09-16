/**
 * Internal Launchpad management for one client.
 *
 *   GET   → the kit as the wiki renders it
 *   PATCH → toggle the wiki section on/off (the sidebar Add New / delete)
 *   POST  → assign (or re-assign) a template, freezing its structure onto the kit
 *
 * Session-authenticated by client slug and gated on `canManageClients`, matching
 * the onboarding-forms routes and the wiki intake tab.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  applyLaunchpadPrefill,
  assignLaunchpad,
  getLaunchpadForClient,
  setLaunchpadEnabled,
} from "@/server/launchpad";
import { launchpadAssignSchema, launchpadEnableSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ launchpad: await getLaunchpadForClient(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);

    const { enabled } = launchpadEnableSchema.parse(await req.json());
    await setLaunchpadEnabled(clientId, enabled);

    // Enabling with no kit yet assigns the default template straight away, then
    // prefills what we already know. Otherwise switching the section on lands the
    // operator (and any client following a link) on an empty page, which reads as a
    // broken feature — the same defect §40.1 hit when enabling API intake minted a
    // token but left the section off.
    if (enabled) {
      const existing = await getLaunchpadForClient(clientId);
      if (!existing?.assigned) {
        await assignLaunchpad(clientId);
        await applyLaunchpadPrefill(clientId);
      }
    }

    return apiOk({ enabled, launchpad: await getLaunchpadForClient(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);

    const body = launchpadAssignSchema.parse(await req.json());
    const assigned = await assignLaunchpad(clientId, body);
    if (!assigned) return apiError("Could not assign a Launchpad template", 500);

    // Fill in what the client record (and an onboarding row, if one exists) already
    // tells us. Only-if-present, and never overwrites an existing answer.
    const launchpad = (await applyLaunchpadPrefill(clientId)) ?? assigned;
    return apiOk({ launchpad }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

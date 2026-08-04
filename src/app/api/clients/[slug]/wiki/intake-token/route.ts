/**
 * GET  /api/clients/[slug]/wiki/intake-token → reveal (minting on first call)
 * POST /api/clients/[slug]/wiki/intake-token → rotate, invalidating the old one
 *
 * The token a client's own system authenticates with when pushing requests
 * (docs/client-intake-api.md). Until this existed there was no way to obtain it
 * short of database access, which is why a client asking for "an API key" for
 * their integration couldn't be handed one.
 *
 * Internal + gated on managing clients: the token is a credential that lets its
 * holder write into a client's wiki, so revealing it is not a read every member
 * should have. Rotating takes effect immediately — use it if a key has been
 * shared too widely or a client's system is decommissioned.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getOrCreateWikiIntakeToken } from "@/server/wiki";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

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
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view the intake token");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ token: await getOrCreateWikiIntakeToken(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "rotate the intake token");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ token: await getOrCreateWikiIntakeToken(clientId, { rotate: true }) });
  } catch (err) {
    return fromError(err);
  }
}

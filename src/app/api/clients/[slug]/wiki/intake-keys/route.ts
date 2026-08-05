/**
 * GET    /api/clients/[slug]/wiki/intake-keys      → list this client's named keys
 * POST   /api/clients/[slug]/wiki/intake-keys      → mint one ({ name })
 * DELETE /api/clients/[slug]/wiki/intake-keys?id=… → revoke one
 *
 * Named keys let a client have SEVERAL systems pushing, each revocable on its own
 * (docs/client-intake-api.md). The shared wiki token still works and is still what
 * the Wedge course feed uses — these are additive.
 *
 * Internal + gated on managing clients: minting a key grants write access to a
 * client's wiki, so it isn't an action every member should have.
 *
 * ⚠️ POST is deliberately STRICTER than the other two. `assertCan(null, …)` lets a
 * workspace-API_KEY-only caller through by design (the convention for server
 * integrations), but minting additionally calls `requireAuthedUser`, so it needs a
 * real signed-in person and an API_KEY-only caller gets a 401. That is intended: a
 * credential granting write access to a client's wiki must have a named issuer, and
 * "who issued this key" has to have an answer later. List and revoke stay reachable
 * to a server integration, because neither creates access.
 *
 * The plaintext key is returned ONCE, by the POST that mints it. Nothing can read
 * it back afterwards — only a hash is stored.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { listIntakeKeys, mintIntakeKey, revokeIntakeKey } from "@/server/wiki-intake-keys";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
  requireAuthedUser,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

const mintSchema = z.object({ name: z.string().trim().min(1).max(80) });

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
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view intake keys");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ keys: await listIntakeKeys(clientId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "mint an intake key");
    // Recorded so there's an answer to "who issued this key" later.
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { name } = mintSchema.parse(await req.json());
    const { key, summary } = await mintIntakeKey(clientId, name, user.id);
    // `key` appears here and nowhere else, ever.
    return apiOk({ key, summary }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "revoke an intake key");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiError("Missing key id", 400);
    const revoked = await revokeIntakeKey(clientId, id);
    if (!revoked) return apiError("Key not found, or already revoked", 404);
    return apiOk({ revoked: true });
  } catch (err) {
    return fromError(err);
  }
}

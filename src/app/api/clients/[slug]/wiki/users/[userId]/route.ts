import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { updateWikiUser, deleteWikiUser } from "@/server/wiki";
import {
  requireAuthedUser,
  assertCan,
  canManageClients,
} from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  email: z.string().email().optional(),
  // Empty/omitted password = keep current; a provided one must be >= 8 chars.
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  name: z.string().max(120).optional(),
});

async function resolveClientId(req: NextRequest, slug: string): Promise<string | null> {
  const user = await requireAuthedUser(req);
  assertCan(user, canManageClients, "manage wiki users");
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: user.workspaceId, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> },
) {
  try {
    const { slug, userId } = await params;
    const clientId = await resolveClientId(req, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = updateSchema.parse(await req.json());
    const updated = await updateWikiUser(clientId, userId, body);
    if (!updated) return apiError("User not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> },
) {
  try {
    const { slug, userId } = await params;
    const clientId = await resolveClientId(req, slug);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteWikiUser(clientId, userId);
    if (!ok) return apiError("User not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

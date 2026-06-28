import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { listWikiUsers, createWikiUser } from "@/server/wiki";
import {
  requireAuthedUser,
  assertCan,
  canManageClients,
} from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(req, slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await listWikiUsers(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(req, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = createSchema.parse(await req.json());
    return apiOk(await createWikiUser(clientId, body));
  } catch (err) {
    return fromError(err);
  }
}

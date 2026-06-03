import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, requireAuthedUser } from "@/server/auth/effective-user";
import { getClientDesignSystem, saveClientDesignSystem } from "@/server/design-system";
import { designSystemSaveSchema } from "@/server/validators";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveClientId(workspaceId: string, slug: string): Promise<string | null> {
  const client = await prisma.workspaceClient.findFirst({
    where: { slug, workspaceId },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getClientDesignSystem(user, clientId));
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "manage client design systems");
    const { slug } = await params;
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = designSystemSaveSchema.parse(await req.json());
    return apiOk(await saveClientDesignSystem(user, clientId, body));
  } catch (e) {
    return fromError(e);
  }
}

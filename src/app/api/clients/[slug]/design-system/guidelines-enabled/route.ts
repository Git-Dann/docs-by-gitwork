import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { setDesignSystemGuidelinesEnabled } from "@/server/design-system";
import { designSystemGuidelinesEnabledSchema } from "@/server/validators";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveClientId(workspaceId: string, slug: string): Promise<string | null> {
  const client = await prisma.workspaceClient.findFirst({
    where: { slug, workspaceId },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "manage the design system page");
    const { slug } = await params;
    await assertClientAccessBySlug(user, slug);
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = designSystemGuidelinesEnabledSchema.parse(await req.json());
    return apiOk(await setDesignSystemGuidelinesEnabled(user, clientId, body.enabled));
  } catch (e) {
    return fromError(e);
  }
}

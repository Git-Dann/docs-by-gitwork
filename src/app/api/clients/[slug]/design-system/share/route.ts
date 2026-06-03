import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, requireAuthedUser } from "@/server/auth/effective-user";
import { setDesignSystemShare } from "@/server/design-system";
import { designSystemShareSchema } from "@/server/validators";
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
    // High-risk: publishes a public, no-login brand page. Gate on clients.manage.
    assertCan(user, canManageClients, "share client design systems");
    const { slug } = await params;
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = designSystemShareSchema.parse(await req.json());
    return apiOk(await setDesignSystemShare(user, clientId, body.enabled));
  } catch (e) {
    return fromError(e);
  }
}

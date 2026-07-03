import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { setClientProductTeam } from "@/server/clients";
import { clientProductTeamSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** Set the client's product team (Gitwork account leads shown on the wiki header). */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "edit clients");
    await assertClientAccessBySlug(user, slug);
    const body = clientProductTeamSchema.parse(await request.json());
    const userIds = await setClientProductTeam(slug, body.userIds);
    if (userIds === null) return apiError("Client not found", 404);
    return apiOk({ productTeamUserIds: userIds });
  } catch (error) {
    return fromError(error);
  }
}

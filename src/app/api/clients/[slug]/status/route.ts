import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { setClientStatus } from "@/server/clients";
import { clientStatusUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "change client status");
    await assertClientAccessBySlug(user, slug);
    const { status } = clientStatusUpdateSchema.parse(await request.json());
    const client = await setClientStatus(slug, status, user);
    if (!client) return apiError("Client not found", 404);
    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

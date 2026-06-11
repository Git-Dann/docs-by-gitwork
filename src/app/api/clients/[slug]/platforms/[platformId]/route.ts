import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteClientPlatform, updateClientPlatform } from "@/server/clients";
import { clientPlatformUpdateSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; platformId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, platformId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    const body = clientPlatformUpdateSchema.parse(await request.json());
    const platform = await updateClientPlatform(platformId, body);

    if (!platform) {
      return Response.json({ error: "Platform not found" }, { status: 404 });
    }

    return apiOk({ platform });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { slug, platformId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    await deleteClientPlatform(platformId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}

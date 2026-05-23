import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteClientPlatform, updateClientPlatform } from "@/server/clients";
import { clientPlatformUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; platformId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { platformId } = await context.params;
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { platformId } = await context.params;
    await deleteClientPlatform(platformId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}

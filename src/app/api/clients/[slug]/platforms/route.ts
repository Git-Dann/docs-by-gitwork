import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientPlatform, getClientIdBySlug } from "@/server/clients";
import { ensureBaseRecords } from "@/server/bootstrap";
import { clientPlatformCreateSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    const { workspace } = await ensureBaseRecords();
    const clientId = await getClientIdBySlug(workspace.id, slug);

    if (!clientId) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const body = clientPlatformCreateSchema.parse(await request.json());
    const platform = await createClientPlatform(clientId, body);

    return apiOk({ platform }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

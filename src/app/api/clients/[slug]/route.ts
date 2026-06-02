import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteClientRecord, getDerivedClientDetail, updateClientRecord } from "@/server/clients";
import { clientUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const client = await getDerivedClientDetail(slug);

    if (!client) {
      return apiError("Client not found", 404);
    }

    return apiOk(client);
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "delete clients");
    const { slug } = await context.params;
    const deleted = await deleteClientRecord(slug);

    if (!deleted) {
      return apiError("Client not found", 404);
    }

    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "edit clients");
    const { slug } = await context.params;
    const body = clientUpdateSchema.parse(await request.json());
    const client = await updateClientRecord(slug, body);

    if (!client) {
      return apiError("Client not found", 404);
    }

    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

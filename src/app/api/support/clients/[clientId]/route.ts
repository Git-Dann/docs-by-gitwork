import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getSupportClient, updateSupportClient, deleteSupportClient } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const client = await getSupportClient(clientId);
    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care clients");
    const { clientId } = await params;
    const body = await request.json();
    const client = await updateSupportClient(clientId, body);
    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care clients");
    const { clientId } = await params;
    await deleteSupportClient(clientId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}

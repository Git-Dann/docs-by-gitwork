import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listDeletedClients } from "@/server/clients";

export const dynamic = "force-dynamic";

/** GET /api/clients/deleted — clients that were deleted (hidden), for the Portal's Deleted tab. */
export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "see deleted clients");
    return apiOk({ clients: await listDeletedClients() });
  } catch (error) {
    return fromError(error);
  }
}

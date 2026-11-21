import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageCode, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { getCodeClearStats } from "@/server/codeclear";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageCode, "read Staff statistics");
    const workspace = { id: await workspaceIdForRequest(request) };
    const stats = await getCodeClearStats(prisma, workspace.id);

    return apiOk(stats);
  } catch (error) {
    return fromError(error);
  }
}

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getForemanFindings } from "@/server/foreman/queries";
import { applyFindingActions } from "@/server/foreman/actions";
import { foremanFindingActionSchema } from "@/server/validators";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

/** GET — latest-run findings annotated with their resolution state (for the Settings manager). */
export async function GET(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const view = await getForemanFindings(await workspaceIdForRequest(request));
    return apiOk({ view });
  } catch (error) {
    return fromError(error);
  }
}

/** POST — dismiss / mute / clear one or many findings (bulk). Body: { findingKeys[], action }. */
export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertAtLeastAdmin(user);
    const body = await request.json();
    const { findingKeys, action } = foremanFindingActionSchema.parse(body);
    const workspace = { id: await workspaceIdForRequest(request) };
    const result = await applyFindingActions(workspace.id, { findingKeys, action, actorId: user?.id ?? null });
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

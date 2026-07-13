import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listClientsWithDesignSystem } from "@/server/design-system";

export const dynamic = "force-dynamic";

// Clients in the workspace that have a design system — powers the Studio brand picker (only
// branded clients are shown). Workspace-scoped; Studio itself is Admin/Super-Admin gated at the route.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ clients: await listClientsWithDesignSystem(user) });
  } catch (e) {
    return fromError(e);
  }
}

/**
 * GET /api/admin/ai-budget → the AI budget for the sidebar's AI spend card (§159): spent (from
 * Anthropic's billing when an Admin key is connected, else Foundry's estimate) against the budget
 * set in Settings → Dispatch. Super Admins only.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { budgetStatus } from "@/server/dispatch/assistant/budget";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // The role is read from the database (requireAuthedUser), never the token.
    const user = await requireAuthedUser(request);
    assertSuperAdmin(user);
    return apiOk(await budgetStatus(user.workspaceId));
  } catch (e) {
    return fromError(e);
  }
}

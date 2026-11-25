/**
 * GET /api/admin/dispatch-usage?days=90 → Dispatch's questions, cost, cache hit rate, people and
 * the AI budget, for Analytics → AI usage (§156). Super Admins only; counts and costs, no text.
 */

import type { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { getDispatchUsage } from "@/server/dispatch/assistant/usage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // The role is read from the database (requireAuthedUser), not the token: see ai-usage.
    const user = await requireAuthedUser(request);
    assertSuperAdmin(user);
    const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 90));
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return apiOk({ usage: await getDispatchUsage(user.workspaceId, from, to) });
  } catch (e) {
    return fromError(e);
  }
}

import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  assertCan,
  canComputeAiFor,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getLeadCrmStatus, getLeadIdBySlug } from "@/server/crm/service";
import { syncLeadCrm } from "@/server/crm/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/clients/{slug}/crm/sync — read the lead's email, Slack, meetings and documents now.
 * Facts and stage moves always run; the token-spending read for suggestions/actions only runs
 * for callers allowed to spend AI (ai.generate) — otherwise the scheduled run picks it up.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "sync a lead");
    await assertClientAccessBySlug(user, slug);
    const id = await getLeadIdBySlug(slug);
    if (!id) return apiError("Client not found", 404);
    const result = await syncLeadCrm(id, { canComputeAi: canComputeAiFor(user) });
    return apiOk({ result, crm: await getLeadCrmStatus(slug, user) });
  } catch (error) {
    return fromError(error);
  }
}

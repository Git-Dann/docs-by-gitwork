/*
 * No in-app caller. Care's own UI assigns through the triage route, so this is an API surface
 * only — kept rather than deleted because a workspace key or an integration can still call it,
 * and a removed route is invisible to every gate we run (CLAUDE.md §11). Its browser fetcher in
 * `src/lib/api.ts` WAS deleted in Nov 2026: that was dead code with no caller of any kind.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignConversation } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const { clientId, convId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("conversation", convId, clientId);
    const body = (await request.json()) as { assigneeId?: string | null };
    const conversation = await assignConversation(convId, body.assigneeId ?? null, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}

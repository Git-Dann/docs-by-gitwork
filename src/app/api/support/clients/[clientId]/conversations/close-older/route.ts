import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  closeConversationsOlderThan,
  countConversationsOlderThan,
  undoConversationReset,
} from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";
import { resolveResetCutoff } from "@/lib/care-reset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Clear a backlog: close everything on this client whose last message predates a date.
 *
 * `dryRun` returns the count without writing, so the dialog can state the number before anything
 * happens. `undoBatchId` puts one run back — and only that one, so a conversation someone closed
 * by hand in between is never reopened.
 *
 * Nothing here deletes anything. Setup-level (`manage`) because it changes a whole client's
 * board in one press, even though it is reversible.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId, "manage");

    const body = (await request.json().catch(() => ({}))) as {
      before?: string;
      presetDays?: number;
      dryRun?: boolean;
      undoBatchId?: string;
    };

    if (body.undoBatchId) {
      return apiOk(await undoConversationReset(clientId, body.undoBatchId));
    }

    const resolved = resolveResetCutoff({ iso: body.before, presetDays: body.presetDays });
    if (!resolved.ok) return apiError(resolved.reason, 400);

    if (body.dryRun) {
      return apiOk({
        count: await countConversationsOlderThan(clientId, resolved.cutoff),
        cutoff: resolved.cutoff.toISOString(),
      });
    }

    const result = await closeConversationsOlderThan(clientId, resolved.cutoff);
    return apiOk({ ...result, cutoff: resolved.cutoff.toISOString() });
  } catch (error) {
    return fromError(error);
  }
}

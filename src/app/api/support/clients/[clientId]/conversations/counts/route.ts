import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getConversationViewCounts } from "@/server/support";

export const dynamic = "force-dynamic";

/**
 * True per-view totals for one client's inbox.
 *
 * Separate from the conversations list on purpose: the list is paginated (50/page), so counting
 * its rows would only ever describe the page. These are COUNTs over the whole client, which is
 * what a badge has to be to be worth reading.
 *
 * "Assigned to me" needs the caller's identity, so it resolves the effective user the same way
 * the list route does for `assigneeId=me`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const user = await getEffectiveUserOrNull(request);
    const counts = await getConversationViewCounts(clientId, user?.id);
    return apiOk({ counts });
  } catch (error) {
    return fromError(error);
  }
}

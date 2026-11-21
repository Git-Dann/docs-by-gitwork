import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listOldestAwaiting } from "@/server/support";
import { requireSupportWorkspace } from "@/server/support-scope";

export const dynamic = "force-dynamic";

/**
 * The longest-waiting conversations across every support-desk client, worst first.
 *
 * Sits beside `queue-summaries` rather than under `/clients/` for the same reason: it is about
 * the whole desk, and a sibling of the `[clientId]` dynamic segment would shadow it.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 6);
    const items = await listOldestAwaiting(
      await requireSupportWorkspace(request),
      Number.isFinite(limit) ? limit : 6,
    );
    return apiOk({ items });
  } catch (error) {
    return fromError(error);
  }
}

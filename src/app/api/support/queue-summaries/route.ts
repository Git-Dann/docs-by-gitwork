import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getClientQueueSummaries } from "@/server/support";

export const dynamic = "force-dynamic";

/**
 * Queue figures for every Care client in the workspace, keyed by client id.
 *
 * Care home used to call the per-client counts endpoint once per row — 10 indexed COUNTs each, so
 * the cost of rendering the page grew with the client list and the numbers landed in a ragged
 * cascade. This answers the whole page in one request and a fixed number of groupBys.
 *
 * Sits at /api/support/queue-summaries rather than under /clients/ so it can never be mistaken for
 * (or shadow) the `[clientId]` dynamic segment.
 */
export async function GET(_request: NextRequest) {
  try {
    const summaries = await getClientQueueSummaries();
    return apiOk({ summaries });
  } catch (error) {
    return fromError(error);
  }
}

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { parseAiSearchRange } from "@/lib/ai-search";
import { assertInternal, requireAuthedUser } from "@/server/auth/effective-user";
import { getAiSearchReport } from "@/server/ai-search";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/ai-search?range=7|28|90[&refresh=1] — how Gitwork shows up on Google and
 * through AI assistants, for the caller's own workspace. Internal-only: it is about our
 * marketing, not about the person asking.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertInternal(user);
    const params = request.nextUrl.searchParams;
    const report = await getAiSearchReport(user.workspaceId, parseAiSearchRange(params.get("range")), {
      refresh: params.get("refresh") === "1",
    });
    return apiOk({ report });
  } catch (error) {
    return fromError(error);
  }
}

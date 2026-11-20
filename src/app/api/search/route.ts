import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { globalSearch } from "@/server/global-search";
import { normaliseQuery } from "@/lib/global-search";

export const dynamic = "force-dynamic";

/** GET /api/search?q=: ⌘K search across tasks, requests, meetings, Care and people the caller can open. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const q = normaliseQuery(request.nextUrl.searchParams.get("q"));
    if (!q) return apiOk({ query: "", hits: [], failed: [] });
    return apiOk(await globalSearch(user, q));
  } catch (error) {
    return fromError(error);
  }
}

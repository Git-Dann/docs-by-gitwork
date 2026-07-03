import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { resolvePublicWiki } from "@/server/wiki";
import { auth } from "@/auth";
import { verifyWikiAccessCookie, wikiAccessCookieName } from "@/server/wiki-access";

// Public — token in the URL resolves the wiki, but viewing is locked down to
// either a logged-in Gitwork/Foundry staff member OR an authenticated client
// user (valid access cookie). No anonymous token-only access.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    // Resolve BOTH whole-wiki share tokens and per-section pageShare tokens
    // (getPublicWiki only matched whole-wiki, 404-ing section-only clients).
    const resolved = await resolvePublicWiki(token);
    if (!resolved) return apiError("Not found", 404);
    const wiki = resolved.wiki;

    const session = await auth();
    const isStaff = Boolean(session?.user?.id);
    if (!isStaff) {
      const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
      const unlocked = await verifyWikiAccessCookie(wiki.id, cookieValue);
      if (!unlocked) return apiError("Login required", 401);
    }

    return apiOk(wiki);
  } catch (err) {
    return fromError(err);
  }
}

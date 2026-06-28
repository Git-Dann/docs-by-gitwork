import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPublicWiki } from "@/server/wiki";
import { verifyWikiAccessCookie, wikiAccessCookieName } from "@/server/wiki-access";

// Public — token in the URL is the resolver. When the wiki has the optional
// username/password gate enabled, a valid access cookie is also required.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const wiki = await getPublicWiki(token);
    if (!wiki) return apiError("Not found", 404);

    if (wiki.accessProtected) {
      const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
      const unlocked = await verifyWikiAccessCookie(wiki.id, cookieValue);
      if (!unlocked) return apiError("Login required", 401);
    }

    return apiOk(wiki);
  } catch (err) {
    return fromError(err);
  }
}

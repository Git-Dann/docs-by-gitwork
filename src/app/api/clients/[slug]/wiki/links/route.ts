import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addWikiLink, listWikiLinks } from "@/server/wiki-links";
import { wikiLinkInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// GET /api/clients/[slug]/wiki/links — clients whose work shows in this wiki.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    return apiOk(await listWikiLinks(user, slug));
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    const body = wikiLinkInputSchema.parse(await req.json());
    return apiOk(await addWikiLink(user, slug, body), { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}

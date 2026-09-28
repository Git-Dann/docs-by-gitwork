import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { removeWikiLink } from "@/server/wiki-links";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id } = await params;
    await removeWikiLink(user, slug, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}

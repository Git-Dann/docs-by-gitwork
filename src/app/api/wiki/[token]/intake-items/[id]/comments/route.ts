import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addWikiIntakeCommentByToken, resolveWikiIdByPublicToken } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { auth } from "@/auth";
import { resolveRequestedBy } from "@/server/wiki-intake-attribution";

const bodySchema = z.object({ body: z.string().trim().min(1).max(10_000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const { body } = bodySchema.parse(await req.json());

    // Same identity resolution as the sibling intake-items route — no typed
    // name field, since every route into the public wiki is authenticated as
    // either a signed-in client wiki user or a Gitwork user previewing it.
    const wikiId = await resolveWikiIdByPublicToken(token);
    const clientUser = wikiId
      ? await resolveWikiAccessUser(wikiId, req.cookies.get(wikiAccessCookieName(wikiId))?.value)
      : null;
    const staff = clientUser ? null : await auth();

    const authorName =
      resolveRequestedBy({
        clientUserName: clientUser?.displayName,
        staffName: staff?.user?.name ?? staff?.user?.email,
      }) ?? "Client wiki";
    const authorKind: "TEAM" | "CLIENT" = staff && !clientUser ? "TEAM" : "CLIENT";

    const comment = await addWikiIntakeCommentByToken(token, id, { authorKind, authorName, body });
    if (!comment) return apiError("Invalid wiki token or request", 404);
    return apiOk(comment, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

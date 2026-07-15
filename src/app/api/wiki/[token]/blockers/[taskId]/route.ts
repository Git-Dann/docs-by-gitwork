import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { resolvePublicWiki } from "@/server/wiki";
import { respondToWikiBlocker } from "@/server/tasks";
import { wikiAccessCookieName, verifyWikiAccessCookie } from "@/server/wiki-access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  response: z.string().max(4000).nullable().optional(),
});

/**
 * Public: the client replies to a dev-flagged blocker from their wiki Requests page.
 * Token-resolved (like course-requests), PLUS the wiki access cookie — this mutates a Task,
 * so we require the same unlock the public page itself demands. Verifies the task is one of
 * this wiki's blockers before writing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; taskId: string }> },
) {
  try {
    const { token, taskId } = await params;
    const resolved = await resolvePublicWiki(token);
    if (!resolved) return apiError("Not found", 404);
    const { wiki } = resolved;

    // Must be unlocked for this wiki (client access cookie) — no anonymous writes.
    const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
    const unlocked = await verifyWikiAccessCookie(wiki.id, cookieValue);
    if (!unlocked) return apiError("Unauthorized", 401);

    // The task must be one of this wiki's current blockers.
    if (!wiki.blockers.some((b) => b.taskId === taskId)) return apiError("Not found", 404);

    const { response } = bodySchema.parse(await req.json());
    await respondToWikiBlocker(taskId, response ?? null);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

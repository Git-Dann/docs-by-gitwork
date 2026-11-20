/**
 * Course requests on the client's share page (CLAUDE.md §140): who may read and change them.
 *
 * The page itself requires a signed-in client user or Gitwork staff, but these routes used to
 * check only the link token, so anyone holding a Wedge share link could edit or delete course
 * requests without logging in. Now they ask the same as the Board: the link is the whole wiki or
 * the Course Requests one, the client has course requests, and the caller is a signed-in client
 * user of this wiki or this client's own team.
 */
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { COURSE_REQUESTS_SLUGS } from "@/lib/wiki-sections";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { teamWriterFor, wikiForToken } from "@/server/wiki-board-access";

export type CourseRequestAccess =
  | { ok: true; clientId: string; wikiId: string }
  | { ok: false; status: number; message: string };

export async function resolveCourseRequestAccess(req: NextRequest, token: string): Promise<CourseRequestAccess> {
  const found = await wikiForToken(token);
  if (!found) return { ok: false, status: 404, message: "Not found" };
  const { wiki, onlySection } = found;
  if (onlySection && onlySection !== "course-requests") {
    return { ok: false, status: 403, message: "This link doesn't give access to course requests." };
  }
  if (!COURSE_REQUESTS_SLUGS.includes(wiki.client.slug)) return { ok: false, status: 404, message: "Not found" };
  const ok = { ok: true as const, clientId: wiki.clientId, wikiId: wiki.id };
  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  if (await resolveWikiAccessUser(wiki.id, cookieValue)) return ok;
  const staff = await auth();
  if (staff?.user?.id && (await teamWriterFor(staff.user.id, wiki.client.workspaceId, wiki.clientId))) return ok;
  return { ok: false, status: 401, message: "Please sign in to your portal to see and change course requests." };
}

/** Generous for someone working through the list, a wall for a script. */
export async function assertCourseRequestRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `course-requests:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 240,
    windowMs: 60_000,
    message: "Too many changes at once — please wait a moment and try again.",
  });
}

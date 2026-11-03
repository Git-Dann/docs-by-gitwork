import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  deleteChangelogEntry,
  updateChangelogEntry,
  updateChangelogEntryStatus,
} from "@/server/wiki";
import { assertEntryInWiki, resolveInternalChangelog } from "@/server/wiki-changelog-access";
import { z } from "zod";

// Status-only toggle, or a full edit of the entry's fields. All optional so the
// status badge can PATCH just { status } while the edit form sends the rest.
const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED"]).optional(),
  version: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  body: z.string().nullable().optional(),
  releasedAt: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    // Scoped to the client in the URL: an id from another client's wiki is a 404 here.
    const { wikiId, byName } = await resolveInternalChangelog(req, slug, "edit this changelog");
    await assertEntryInWiki(id, wikiId);
    const body = patchSchema.parse(await req.json());

    // A status-only payload uses the lightweight updater; anything else is a full edit.
    const isStatusOnly =
      body.status !== undefined &&
      body.version === undefined &&
      body.title === undefined &&
      body.body === undefined &&
      body.releasedAt === undefined;

    const entry = isStatusOnly
      ? await updateChangelogEntryStatus(id, body.status!, byName)
      : await updateChangelogEntry(
          id,
          {
            version: body.version,
            title: body.title,
            body: body.body,
            releasedAt: body.releasedAt,
            status: body.status,
          },
          byName,
        );
    return apiOk(entry);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    const { wikiId } = await resolveInternalChangelog(req, slug, "delete from this changelog");
    await assertEntryInWiki(id, wikiId);
    await deleteChangelogEntry(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

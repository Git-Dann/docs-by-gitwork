import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  deleteChangelogEntry,
  updateChangelogEntry,
  updateChangelogEntryStatus,
} from "@/server/wiki";
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
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    // A status-only payload uses the lightweight updater; anything else is a full edit.
    const isStatusOnly =
      body.status !== undefined &&
      body.version === undefined &&
      body.title === undefined &&
      body.body === undefined &&
      body.releasedAt === undefined;

    const entry = isStatusOnly
      ? await updateChangelogEntryStatus(id, body.status!)
      : await updateChangelogEntry(id, {
          version: body.version,
          title: body.title,
          body: body.body,
          releasedAt: body.releasedAt,
          status: body.status,
        });
    return apiOk(entry);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { id } = await params;
    await deleteChangelogEntry(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

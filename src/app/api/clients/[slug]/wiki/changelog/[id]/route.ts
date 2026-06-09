import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteChangelogEntry, updateChangelogEntryStatus } from "@/server/wiki";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const entry = await updateChangelogEntryStatus(id, body.status);
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

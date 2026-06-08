import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteChangelogEntry } from "@/server/wiki";

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
